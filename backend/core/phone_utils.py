import re
from typing import Optional

def normalize_phone(phone: str, default_country_code: str = "91") -> Optional[str]:
    """
    SCH-01: Normalize a phone number to E.164 format.
    Strips spaces, dashes, parentheses.
    If no leading '+', adds '+' and the default country code if missing.
    Returns None if the phone is empty or highly invalid.
    """
    if not phone:
        return None
        
    # Strip all non-digit and non-plus characters
    cleaned = re.sub(r'[^\d+]', '', str(phone))
    
    if not cleaned:
        return None

    # If it already starts with a plus, assume it's fully qualified
    if cleaned.startswith('+'):
        return cleaned
        
    # If it starts with country code (e.g. 91) but no plus
    if cleaned.startswith(default_country_code) and len(cleaned) > 10:
        return f"+{cleaned}"
        
    # Otherwise, assume it's a local number and append + and country code
    # e.g., 9876543210 -> +919876543210
    return f"+{default_country_code}{cleaned}"
