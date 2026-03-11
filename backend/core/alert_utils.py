"""
core/alert_utils.py
===================
RD-04 / RD-05: Single source of truth for alert severity thresholds,
message formatting, and sorting logic.

Previously the alert computation in `routers/dashboard.py` contained
inline if/else chains that any future caller (automation, WhatsApp reminder
scheduler, etc.) would have to duplicate. This module exposes clean helper
functions so all callers share identical business rules.

Usage
-----
from core.alert_utils import (
    make_expiry_alert,
    make_low_stock_alert,
    make_overdue_balance_alert,
    sort_alerts,
)
"""

from __future__ import annotations

from datetime import date
from typing import Any


# ─── Severity constants ────────────────────────────────────────────────────────

SEVERITY_HIGH   = "high"
SEVERITY_MEDIUM = "medium"

# Days-remaining threshold for HIGH vs MEDIUM expiry severity
EXPIRY_HIGH_THRESHOLD_DAYS = 3   # <= 3 days remaining → HIGH


# ─── Alert builders ───────────────────────────────────────────────────────────

def expiry_severity_and_message(days_diff: int) -> tuple[str, str]:
    """
    Return (severity, message) for a member expiry alert.

    Args:
        days_diff: (NextDuedate - today).days  — negative means already expired.

    Returns:
        (severity: "high"|"medium", message: str)
    """
    if days_diff < 0:
        return SEVERITY_HIGH, f"Expired {abs(days_diff)} days ago"
    elif days_diff == 0:
        return SEVERITY_HIGH, "Expires today"
    else:
        sev = SEVERITY_HIGH if days_diff <= EXPIRY_HIGH_THRESHOLD_DAYS else SEVERITY_MEDIUM
        return sev, f"Expires in {days_diff} days"


def make_expiry_alert(
    member_id: str,
    member_name: str,
    days_diff: int,
) -> dict[str, Any]:
    """Build a member expiry alert dict.

    Args:
        member_id:   Member.id
        member_name: Member.Name (or fallback)
        days_diff:   (NextDuedate - today).days

    Returns:
        Alert dict with keys: type, severity, title, entityId, entityType.
    """
    severity, msg = expiry_severity_and_message(days_diff)
    return {
        "type":       "expiry",
        "severity":   severity,
        "title":      f"{member_name}: {msg}",
        "entityId":   member_id,
        "entityType": "member_expiry",
    }


def make_low_stock_alert(
    protein_id: str,
    product_name: str | None,
    brand: str | None,
    quantity: int,
) -> dict[str, Any]:
    """Build a low-stock protein alert dict.

    Args:
        protein_id:   ProteinStock.id
        product_name: ProteinStock.ProductName
        brand:        ProteinStock.Brand
        quantity:     Current stock quantity

    Returns:
        Alert dict with keys: type, severity, title, entityId, entityType.
    """
    name = product_name or brand or "Unknown"
    return {
        "type":       "low_stock",
        "severity":   SEVERITY_MEDIUM,
        "title":      f"{name} is low ({quantity} remaining)",
        "entityId":   protein_id,
        "entityType": "protein",
    }


def make_overdue_balance_alert(
    invoice_id: str,
    customer_name: str | None,
    balance: float,
) -> dict[str, Any]:
    """Build an overdue balance alert dict.

    Args:
        invoice_id:    Invoice.id
        customer_name: Invoice.customerName (or fallback)
        balance:       total - paidAmount

    Returns:
        Alert dict with keys: type, severity, title, entityId, entityType.
    """
    name = customer_name or "Customer"
    return {
        "type":       "overdue_balance",
        "severity":   SEVERITY_HIGH,
        "title":      f"Overdue ₹{balance:.0f} ({name})",
        "entityId":   invoice_id,
        "entityType": "pending_balance",
    }


def sort_alerts(alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Sort alerts: HIGH first, then MEDIUM.

    Args:
        alerts: List of alert dicts (each must have a 'severity' key).

    Returns:
        Sorted list (mutates in place and also returns it).
    """
    alerts.sort(key=lambda x: 0 if x.get("severity") == SEVERITY_HIGH else 1)
    return alerts
