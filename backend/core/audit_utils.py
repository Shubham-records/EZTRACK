# core/audit_utils.py
"""
Centralized audit logging utility.
Call after every state-changing operation on core entities.
Does NOT commit — caller commits as part of their transaction.
"""
from sqlalchemy.orm import Session


def log_audit(db: Session, gym_id: str, entity_type: str, entity_id: str,
              action: str, changes: dict, user_name: str):
    """
    Append one row to AuditLog.
    
    Args:
        db:          Active SQLAlchemy session (must be committed by caller).
        gym_id:      The gym this entity belongs to.
        entity_type: One of: Member, ProteinStock, Invoice, Expense, GymSettings
        entity_id:   PK of the entity being changed.
        action:      CREATE | UPDATE | DELETE
        changes:     Diff dict: { "fieldName": { "from": old, "to": new } }
        user_name:   Username of the staff performing the action.
    """
    from models.all_models import AuditLog
    entry = AuditLog(
        gymId=gym_id,
        entityType=entity_type,
        entityId=entity_id,
        action=action,
        changes=changes,
        userName=user_name,
    )
    db.add(entry)
    # Do NOT commit here — caller commits as part of their transaction


def compute_diff(old_dict: dict, new_dict: dict, fields: list = None) -> dict:
    """
    Compute a diff between two dicts for audit logging.
    
    Args:
        old_dict: Previous state (e.g. from __dict__ before update).
        new_dict: New state.
        fields:   Optional list of field names to compare. If None, compares all keys.
    
    Returns:
        Dict of changed fields: { "field": { "from": old_value, "to": new_value } }
    """
    diff = {}
    keys = fields if fields else set(list(old_dict.keys()) + list(new_dict.keys()))
    
    for key in keys:
        if key.startswith('_'):
            continue
        old_val = old_dict.get(key)
        new_val = new_dict.get(key)
        # Convert non-serializable types to strings for JSON storage
        if hasattr(old_val, 'isoformat'):
            old_val = old_val.isoformat()
        if hasattr(new_val, 'isoformat'):
            new_val = new_val.isoformat()
        if old_val != new_val:
            diff[key] = {"from": old_val, "to": new_val}
    
    return diff
