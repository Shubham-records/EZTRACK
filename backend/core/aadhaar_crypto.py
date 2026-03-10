"""
core/aadhaar_crypto.py — Aadhaar Encryption/Decryption
========================================================
SEC-05 / SCH-07: Aadhaar stored encrypted at rest using Fernet (AES-128-CBC + HMAC-SHA256).
The ENCRYPTION_KEY env var (64 hex chars = 32 bytes) is derived into a Fernet key.

Design decisions
----------------
- encrypt(value)          → base64 ciphertext (stored in DB)
- decrypt(ciphertext)     → plaintext (never sent to API clients)
- hash_for_search(value)  → HMAC-SHA256 hex (deterministic, used for dedup search)
  Fernet uses a random IV — you cannot SQL-compare two Fernet ciphertexts.
  We store a *separate* HMAC hash (AadhaarHash column) for dedup detection.
- mask(value)             → "XXXX-XXXX-NNNN" (API response display)

Usage
-----
    from core.aadhaar_crypto import encrypt_aadhaar, decrypt_aadhaar, hash_aadhaar, mask_aadhaar

    # On member CREATE/UPDATE:
    encrypted = encrypt_aadhaar(raw_aadhaar)
    hmac_hash = hash_aadhaar(raw_aadhaar)
    member.Aadhaar = encrypted
    member.AadhaarHash = hmac_hash

    # On API response:
    masked = mask_aadhaar(decrypt_aadhaar(member.Aadhaar))

    # Dedup check (before creating member):
    h = hash_aadhaar(raw_aadhaar)
    existing = db.query(Member).filter(Member.AadhaarHash == h, Member.gymId == gym_id).first()
"""

import base64
import hashlib
import hmac
import logging
import os

logger = logging.getLogger(__name__)

# ─── Key derivation ───────────────────────────────────────────────────────────

def _derive_fernet_key() -> bytes:
    """
    Derive a 32-byte key from ENCRYPTION_KEY  env var (64 hex chars).
    Returns URL-safe base64-encoded 32-byte key (Fernet requirement).
    """
    raw_hex = os.getenv("ENCRYPTION_KEY", "")
    if not raw_hex or len(raw_hex) < 32:
        raise RuntimeError(
            "ENCRYPTION_KEY env var must be set to at least 64 hex characters "
            "(32 bytes). Generate with: python3 -c \"import secrets; print(secrets.token_hex(32))\""
        )
    key_bytes = bytes.fromhex(raw_hex[:64])   # take first 32 bytes
    return base64.urlsafe_b64encode(key_bytes)


# ─── Cached singletons — initialized once at first use ────────────────────────

_FERNET_INSTANCE = None
_HMAC_KEY_INSTANCE = None


def _fernet():
    """Return a cached Fernet instance (created once, reused for all calls)."""
    global _FERNET_INSTANCE
    if _FERNET_INSTANCE is None:
        try:
            from cryptography.fernet import Fernet
            _FERNET_INSTANCE = Fernet(_derive_fernet_key())
        except ImportError:
            raise RuntimeError(
                "cryptography package is required for Aadhaar encryption. "
                "Run: pip install cryptography"
            )
    return _FERNET_INSTANCE


def _hmac_key() -> bytes:
    """Return a cached HMAC key (derived once from ENCRYPTION_KEY)."""
    global _HMAC_KEY_INSTANCE
    if _HMAC_KEY_INSTANCE is None:
        raw_hex = os.getenv("ENCRYPTION_KEY", "")
        if len(raw_hex) < 64:
            _HMAC_KEY_INSTANCE = bytes.fromhex(raw_hex.ljust(64, "0"))[:32]
        else:
            _HMAC_KEY_INSTANCE = hashlib.sha256(bytes.fromhex(raw_hex[:64])).digest()
    return _HMAC_KEY_INSTANCE


# ─── Public API ───────────────────────────────────────────────────────────────

def encrypt_aadhaar(plaintext: str) -> str:
    """
    Encrypt a 12-digit Aadhaar number.
    Returns a Fernet token (URL-safe base64 string).
    Each call produces a different ciphertext (random IV) — use hash_aadhaar() for search.
    """
    if not plaintext:
        return plaintext
    f = _fernet()
    return f.encrypt(plaintext.strip().encode()).decode()


def decrypt_aadhaar(ciphertext: str) -> str:
    """
    Decrypt a Fernet-encrypted Aadhaar back to plaintext.
    Returns empty string on failure (DB corruption, key rotation).
    This value MUST NOT be sent to API clients — use mask_aadhaar() instead.
    """
    if not ciphertext:
        return ""
    try:
        f = _fernet()
        return f.decrypt(ciphertext.encode()).decode()
    except Exception:
        logger.warning("Failed to decrypt Aadhaar — returning empty string. Key rotation needed?")
        return ""


def hash_aadhaar(plaintext: str) -> str:
    """
    Produce a deterministic HMAC-SHA256 hex digest of the Aadhaar number.
    Used exclusively for duplicate detection (WHERE AadhaarHash = ?).
    Cannot be reversed to the original value.
    """
    if not plaintext:
        return ""
    key = _hmac_key()
    h = hmac.new(key, plaintext.strip().encode(), hashlib.sha256)
    return h.hexdigest()


def mask_aadhaar(plaintext: str) -> str:
    """
    Return masked Aadhaar for display: "XXXX-XXXX-NNNN" (last 4 digits visible).
    Safe to include in API responses.
    """
    if not plaintext:
        return None
    digits = plaintext.strip()
    last4 = digits[-4:] if len(digits) >= 4 else "????"
    return f"XXXX-XXXX-{last4}"
