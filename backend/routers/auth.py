from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import get_db
from core.security import verify_password, create_access_token
from models.all_models import Gym
from schemas.auth import LoginRequest, LoginResponse

router = APIRouter()

@router.post("/login", response_model=LoginResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    gym = db.query(Gym).filter(Gym.username == request.username).first()
    if not gym:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Username not found!"
        )
    
    if not verify_password(request.password, gym.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect password!"
        )
    
    access_token = create_access_token(
        data={"gymId": gym.id, "username": gym.username}
    )
    
    return {
        "message": "Login successful!",
        "eztracker_jwt_access_control_token": access_token,
        "eztracker_jwt_databaseName_control_token": gym.id
    }
