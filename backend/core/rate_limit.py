import logging
from fastapi import Request
from jose import jwt
from core.config import settings
from core.security import JWT_AUDIENCE, JWT_ISSUER, decode_access_token

logger = logging.getLogger(__name__)

try:
    from slowapi import Limiter
    from slowapi.util import get_remote_address
    
    def get_gym_id_from_token(request: Request) -> str:
        """
        Extract gymId for rate limit keying. Falls back to IP.
        SEC-V-02: Track by both gymId and IP to prevent distributed attacks.
        """
        auth_header = request.headers.get("Authorization", "")
        ip_addr = get_remote_address(request)
        
        if auth_header.startswith("Bearer "):
            token = auth_header.replace("Bearer ", "")
            if token:
                try:
                    payload = decode_access_token(token)
                    gymId = payload.get("gymId")
                    if gymId:
                        return f"{gymId}:{ip_addr}"
                except Exception:
                    pass
                    
        return ip_addr

    limiter = Limiter(key_func=get_gym_id_from_token)
    
except ImportError:
    limiter = None

def rate_limit(limit_str: str):
    """
    Decorator for rate limiting endpoints using the central limiter.
    """
    if limiter:
        return limiter.limit(limit_str)
    def _noop(fn): 
        return fn
    return _noop
