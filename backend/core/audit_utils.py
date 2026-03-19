# core/audit_utils.py
"""
Centralized audit logging utility.
Call after every state-changing operation on core entities.
Does NOT commit — caller commits as part of their transaction.

SEC-13: SENSITIVE_FIELDS are redacted to '[REDACTED]' in compute_diff()
        so Aadhaar/phone never appear in AuditLog.changes JSON.

SEC-NEW-08: log_audit() now accepts an optional `ip_address` parameter.
            Callers that have access to the Request object should pass
            request.client.host so the ipAddress column is populated.
            For internal/background calls where no request is available,
            ip_address remains None (acceptable — documented gap).
"""
import logging
import asyncio
from typing import Optional, Any
from sqlalchemy.orm import Session
from sqlalchemy.ext.asyncio import AsyncSession
import contextvars

logger = logging.getLogger(__name__)

# WA-02: Asynchronous Audit Queue
# Buffers audit entries in memory and flushes them periodically, completely removing
# the INSERT penalty from the main business transaction.
audit_queue: asyncio.Queue = asyncio.Queue()

# SEC-NEW-08: Context variable to store the originating IP address
request_ip_var = contextvars.ContextVar("request_ip", default=None)

# SEC-13: Fields that must never appear in audit log diffs
SENSITIVE_FIELDS = frozenset({
    "Aadhaar", "AadhaarHash", "password", "Mobile", "Whatsapp",
    "cardNumber", "cvv", "bankAccount",
})


def log_audit(
    db, # Can be Sync or Async Session, ignored now since we use the background queue
    gym_id: str,
    entity_type: str,
    entity_id: str,
    action: str,
    changes: dict,
    user_name: str,
    ip_address: Optional[str] = None,
):
    """
    Push one row to the async AuditLog queue.

    Args:
        db:          Active SQLAlchemy session (must be committed by caller).
        gym_id:      The gym this entity belongs to.
        entity_type: One of: Member, ProteinStock, Invoice, Expense, GymSettings
        entity_id:   PK of the entity being changed.
        action:      CREATE | UPDATE | DELETE
        changes:     Diff dict: { "fieldName": { "from": old, "to": new } }
        user_name:   Username of the staff performing the action.
        ip_address:  SEC-NEW-08: Originating IP for compliance audit trail.
                     Pass request.client.host from the FastAPI Request object.
                     None if called from a background context.
    """
    from models.all_models import AuditLog

    # SEC-13: Scrub sensitive fields
    safe_changes = _scrub_sensitive(changes)

    # SEC-NEW-08: fallback to context var if not explicitly provided
    if ip_address is None:
        ip_address = request_ip_var.get()

    entry = AuditLog(
        gymId=gym_id,
        entityType=entity_type,
        entityId=entity_id,
        action=action,
        changes=safe_changes,
        userName=user_name,
        ipAddress=ip_address,   # SEC-NEW-08: populated when request context is available
    )
    
    # WA-02: Non-blocking queue insertion instead of db.add(entry)
    try:
        audit_queue.put_nowait(entry)
    except Exception as exc:
        logger.error(f"Failed to queue audit log: {exc}")


async def audit_worker():
    """
    WA-02: Background worker that flushes the audit queue periodically.
    Runs every 5 seconds or when 100 entries are buffered.
    """
    from core.database import async_engine
    from sqlalchemy.orm import sessionmaker
    AsyncSessionLocal = sessionmaker(
        autocommit=False, autoflush=False, bind=async_engine, class_=AsyncSession
    )

    while True:
        entries = []
        try:
            # Wait for at least one entry, then gather up to 100 or timeout in 5s
            entry = await audit_queue.get()
            entries.append(entry)
            
            # Try to drain up to 99 more entries instantly
            while len(entries) < 100:
                try:
                    # fetch anything else in the queue instantly
                    entry = audit_queue.get_nowait()
                    entries.append(entry)
                except asyncio.QueueEmpty:
                    break
                    
            if entries:
                async with AsyncSessionLocal() as session:
                    session.add_all(entries)
                    await session.commit()
                
                # Mark tasks as done
                for _ in entries:
                    audit_queue.task_done()
                    
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error(f"Error flushing audit logs: {exc}")
        
        # Prevent tight loops if there's an error
        await asyncio.sleep(1)


def _scrub_sensitive(changes: dict) -> dict:
    """Replace values of sensitive fields with '[REDACTED]'."""
    if not changes:
        return changes
    scrubbed: dict[str, Any] = {}
    for key, value in changes.items():
        if key in SENSITIVE_FIELDS:
            scrubbed[key] = "[REDACTED]"
        elif isinstance(value, dict) and ("from" in value or "to" in value):
            # Diff format: { "from": old, "to": new }
            scrubbed[key] = {"from": "[REDACTED]", "to": "[REDACTED]"}
        else:
            scrubbed[key] = value
    return scrubbed


def compute_diff(old_dict: dict, new_dict: dict, fields: Optional[list] = None) -> dict:
    """
    Compute a diff between two dicts for audit logging.

    Args:
        old_dict: Previous state (e.g. from __dict__ before update).
        new_dict: New state.
        fields:   Optional list of field names to compare. If None, compares all keys.

    Returns:
        Dict of changed fields: { "field": { "from": old_value, "to": new_value } }
        Sensitive fields are automatically redacted.
    """
    diff: dict[str, Any] = {}
    keys = fields if fields else set(list(old_dict.keys()) + list(new_dict.keys()))

    for key in keys:
        if isinstance(key, str) and key.startswith('_'):
            continue
        old_val: Any = old_dict.get(key)
        new_val: Any = new_dict.get(key)
        # Convert non-serializable types to strings for JSON storage
        if hasattr(old_val, 'isoformat'):
            old_val = old_val.isoformat()
        if hasattr(new_val, 'isoformat'):
            new_val = new_val.isoformat()
        if old_val != new_val:
            if key in SENSITIVE_FIELDS:
                diff[key] = {"from": "[REDACTED]", "to": "[REDACTED]"}
            else:
                diff[key] = {"from": old_val, "to": new_val}

    return diff
