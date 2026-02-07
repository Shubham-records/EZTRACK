from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import get_db
from core.security import verify_password, create_access_token, get_password_hash
from core.dependencies import get_current_gym
from models.all_models import Gym
from schemas.auth import LoginRequest, LoginResponse, SignupRequest
import uuid

router = APIRouter()

@router.post("/login", response_model=LoginResponse)
@router.post("/login/", response_model=LoginResponse, include_in_schema=False)
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

@router.post("/signup", status_code=status.HTTP_201_CREATED)
@router.post("/signup/", status_code=status.HTTP_201_CREATED, include_in_schema=False)
def signup(request: SignupRequest, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(Gym).filter(Gym.username == request.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered!"
        )
    
    existing_email = db.query(Gym).filter(Gym.email == request.EMAILID).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered!"
        )

    new_gym = Gym(
        id=str(uuid.uuid4()),
        gymname=request.GYMNAME,
        email=request.EMAILID,
        username=request.username,
        password=get_password_hash(request.password)
    )
    
    db.add(new_gym)
    db.commit()
    db.refresh(new_gym)
    
    return "User registered successfully!"

@router.get("/me")
@router.get("/me/")
def get_me(current_gym: Gym = Depends(get_current_gym)):
    return {
        "id": current_gym.id,
        "username": current_gym.username,
        "gymname": current_gym.gymname,
        "email": current_gym.email,
        "role": "OWNER" # Default role as per current model
    }

@router.post("/logout")
@router.post("/logout/")
def logout():
    return {"message": "Logged out successfully"}
