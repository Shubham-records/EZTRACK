"""
Date utilities for EZTRACK.
Default display format: DD/MM/YYYY
Storage: Native PostgreSQL DATE columns
"""
from datetime import date, datetime
from typing import Optional, Union


def parse_date(value: Optional[Union[str, date]]) -> Optional[date]:
    """
    Parse a date from string (DD/MM/YYYY or YYYY-MM-DD) or pass through date objects.
    Returns None for invalid/empty values.
    """
    if value is None:
        return None
    if isinstance(value, date):
        return value
    if isinstance(value, datetime):
        return value.date()
    if not isinstance(value, str) or not value.strip():
        return None
    
    value = value.strip()
    
    # Try DD/MM/YYYY first (the user's preferred format)
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(value, fmt).date()
        except ValueError:
            continue
    
    return None


def format_date(value: Optional[date], fmt: str = "%d/%m/%Y") -> Optional[str]:
    """
    Format a date object to string. Default: DD/MM/YYYY.
    Returns None if value is None.
    """
    if value is None:
        return None
    if isinstance(value, datetime):
        value = value.date()
    if isinstance(value, date):
        return value.strftime(fmt)
    return None


def format_date_iso(value: Optional[date]) -> Optional[str]:
    """Format as YYYY-MM-DD (for HTML date inputs)."""
    return format_date(value, "%Y-%m-%d")
