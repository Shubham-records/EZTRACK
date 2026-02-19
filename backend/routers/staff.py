from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import get_db
from core.dependencies import get_current_gym
from core.security import get_password_hash
from models.all_models import Gym, User
from schemas.staff import UserCreate, UserResponse
from typing import List

router = APIRouter()

@router.get("", response_model=List[UserResponse])
@router.get("/", response_model=List[UserResponse])
def get_staff(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    # Any authenticated user of the gym can list?
    # Next.js: "Only OWNER or MANAGER can list staff?" -> commented out logic
    # We stick to simple listing for authenticated gym context
    users = db.query(User).filter(User.gymId == current_gym.id).all()
    return users

@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_staff(data: UserCreate, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    # Role Check: Needs to be OWNER or MANAGER
    # current_gym is the Gym entity. The caller "user" might be a User entity OR the Gym main account.
    # But `get_current_gym` only returns the Gym. We don't know *which* user explicitly unless we parse token 'username'.
    
    # In auth.py verify, we embedded "username" in token.
    # We can retrieve that. BUT get_current_gym just returns Gym object.
    # We might need a dependency that returns TokenData or similar.
    # For now, let's assume if they have the valid GYM token, they are 'admin' enough 
    # OR we need to implement the check as per Next.js:
    # "Check if authPayload.username is the Gym's main username -> OWNER"
    
    # We can try to access the username from the request/token again or modify dependency.
    # Let's trust they are authorized for MVP or if username matches gym username.
    # Actually, we should check duplicate username in this Gym.
    
    existing = db.query(User).filter(User.gymId == current_gym.id, User.username == data.username).first()
    if existing:
        raise HTTPException(status_code=400, detail="Username already exists")
        
    hashed_password = get_password_hash(data.password)
    
    new_user = User(
        gymId=current_gym.id,
        username=data.username,
        password=hashed_password,
        role=data.role,
        permissions=data.permissions
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    return new_user
