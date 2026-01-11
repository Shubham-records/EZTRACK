from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from core.database import get_db
from core.config import settings
from models.all_models import Gym

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="api/auth/login")

def get_current_gym(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.ALGORITHM])
        gymId: str = payload.get("gymId")
        if gymId is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
        
    gym = db.query(Gym).filter(Gym.id == gymId).first()
    if gym is None:
        raise credentials_exception
    return gym
