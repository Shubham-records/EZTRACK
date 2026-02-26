from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from core.database import get_db
from core.security import verify_password, create_access_token, get_password_hash
from core.dependencies import get_current_gym
from models.all_models import Gym, Branch, WhatsAppTemplate
from schemas.auth import LoginRequest, LoginResponse, SignupRequest
from routers.whatsapp_templates import DEFAULT_TEMPLATES
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

    # Auto-create default Branch
    default_branch = Branch(
        id=str(uuid.uuid4()),
        gymId=new_gym.id,
        name=request.GYMNAME,
        displayName=request.GYMNAME,
        isActive=True,
        isDefault=True,
        email=request.EMAILID,
    )
    db.add(default_branch)

    # Auto-create default WhatsApp templates
    for t_type, t_msg in DEFAULT_TEMPLATES.items():
        template = WhatsAppTemplate(
            gymId=new_gym.id,
            templateType=t_type,
            messageTemplate=t_msg,
            isActive=True,
        )
        db.add(template)

    db.commit()

    return "User registered successfully!"

@router.get("/me")
@router.get("/me/")
def get_me(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    # Get branches this gym has
    branches = db.query(Branch).filter(Branch.gymId == current_gym.id, Branch.isActive == True).all()
    branch_list = [{"id": b.id, "name": b.name, "isDefault": b.isDefault} for b in branches]
    default_branch = next((b for b in branch_list if b["isDefault"]), branch_list[0] if branch_list else None)

    return {
        "id": current_gym.id,
        "username": current_gym.username,
        "gymname": current_gym.gymname,
        "email": current_gym.email,
        "role": "OWNER",
        "branches": branch_list,
        "activeBranchId": default_branch["id"] if default_branch else None,
        "isMultiBranch": len(branch_list) > 1,
    }

@router.post("/logout")
@router.post("/logout/")
def logout():
    return {"message": "Logged out successfully"}
