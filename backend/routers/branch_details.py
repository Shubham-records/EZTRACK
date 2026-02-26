from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from sqlalchemy.orm import Session
from typing import Optional
import base64

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, Branch
from schemas.branch_details import BranchDetailsCreate, BranchDetailsUpdate, BranchDetailsResponse

router = APIRouter()


def _to_response(b: Branch) -> dict:
    """Convert Branch ORM object to response dict."""
    return {
        "id": b.id,
        "gymId": b.gymId,
        "branchId": b.id,
        "gymName": b.displayName or b.name,
        "phone": b.phone,
        "whatsapp": b.whatsapp,
        "email": b.email,
        "slogan": b.slogan,
        "website": b.website,
        "address": b.address,
        "city": b.city,
        "state": b.state,
        "pincode": b.pincode,
        "phoneCountryCode": b.phoneCountryCode or '+91',
        "hasLogo": b.logoData is not None,
    }

def get_default_branch(current_gym_id: str, db: Session) -> Branch:
    branch = db.query(Branch).filter(
        Branch.gymId == current_gym_id,
        Branch.isDefault == True
    ).first()
    
    # Fallback to any branch if no default exists
    if not branch:
        branch = db.query(Branch).filter(
            Branch.gymId == current_gym_id
        ).first()

    if not branch:
        # Create a default branch
        gym = db.query(Gym).filter(Gym.id == current_gym_id).first()
        branch = Branch(
            gymId=current_gym_id,
            name=gym.gymname,
            displayName=gym.gymname,
            isActive=True,
            isDefault=True
        )
        db.add(branch)
        db.commit()
        db.refresh(branch)
        
    return branch


@router.get("")
def get_gym_details(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get gym-level details (default branch)."""
    branch = get_default_branch(current_gym.id, db)
    return _to_response(branch)


@router.get("/all")
def get_all_branch_details(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get all branch details for this gym."""
    branches = db.query(Branch).filter(
        Branch.gymId == current_gym.id
    ).all()
    if not branches:
        branches = [get_default_branch(current_gym.id, db)]
    return [_to_response(b) for b in branches]


@router.get("/for-invoice")
def get_details_for_invoice(
    branch_id: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Smart endpoint: returns branch-specific details if available, else gym-level fallback."""
    if branch_id:
        branch = db.query(Branch).filter(
            Branch.gymId == current_gym.id,
            Branch.id == branch_id
        ).first()
        if branch:
            return _to_response(branch)

    # Fallback to default branch
    branch = get_default_branch(current_gym.id, db)
    return _to_response(branch)


@router.get("/branch/{branch_id}")
def get_branch_details(
    branch_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get details for a specific branch."""
    branch = db.query(Branch).filter(
        Branch.gymId == current_gym.id,
        Branch.id == branch_id
    ).first()

    if not branch:
        raise HTTPException(status_code=404, detail="Branch details not found")

    return _to_response(branch)


@router.put("")
def update_gym_details(
    data: BranchDetailsUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Create or update gym-level details (default branch)."""
    branch = get_default_branch(current_gym.id, db)

    update_data = data.model_dump(exclude_unset=True)
    if "gymName" in update_data:
        update_data["displayName"] = update_data.pop("gymName")
    
    for key, value in update_data.items():
        if hasattr(branch, key):
            setattr(branch, key, value)

    db.commit()
    db.refresh(branch)
    return _to_response(branch)


@router.put("/branch/{branch_id}")
def update_branch_details(
    branch_id: str,
    data: BranchDetailsUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Create or update branch-specific details."""
    branch = db.query(Branch).filter(
        Branch.id == branch_id,
        Branch.gymId == current_gym.id
    ).first()
    
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    update_data = data.model_dump(exclude_unset=True)
    if "gymName" in update_data:
        update_data["displayName"] = update_data.pop("gymName")

    for key, value in update_data.items():
        if hasattr(branch, key):
            setattr(branch, key, value)

    db.commit()
    db.refresh(branch)
    return _to_response(branch)


@router.post("/logo")
async def upload_gym_logo(
    file: UploadFile = File(...),
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Upload gym-level logo (default branch)."""
    if file.content_type not in ["image/png", "image/jpeg", "image/webp"]:
        raise HTTPException(status_code=400, detail="Only PNG, JPEG, or WebP images are allowed")

    branch = get_default_branch(current_gym.id, db)

    branch.logoData = await file.read()
    branch.logoMimeType = file.content_type
    db.commit()

    return {"message": "Logo uploaded successfully"}


@router.post("/branch/{branch_id}/logo")
async def upload_branch_logo(
    branch_id: str,
    file: UploadFile = File(...),
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Upload branch-specific logo."""
    if file.content_type not in ["image/png", "image/jpeg", "image/webp"]:
        raise HTTPException(status_code=400, detail="Only PNG, JPEG, or WebP images are allowed")

    branch = db.query(Branch).filter(
        Branch.gymId == current_gym.id,
        Branch.id == branch_id
    ).first()

    if not branch:
         raise HTTPException(status_code=404, detail="Branch not found")

    branch.logoData = await file.read()
    branch.logoMimeType = file.content_type
    db.commit()

    return {"message": "Branch logo uploaded successfully"}


@router.get("/logo")
def get_gym_logo(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get gym-level logo image."""
    branch = get_default_branch(current_gym.id, db)

    if not branch.logoData:
        raise HTTPException(status_code=404, detail="No logo found")

    return Response(
        content=branch.logoData,
        media_type=branch.logoMimeType or "image/png"
    )


@router.get("/logo/base64")
def get_gym_logo_base64(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get gym-level logo as base64 string (for PDF embedding)."""
    branch = get_default_branch(current_gym.id, db)

    if not branch.logoData:
        return {"logo": None}

    b64 = base64.b64encode(branch.logoData).decode("utf-8")
    return {
        "logo": f"data:{branch.logoMimeType or 'image/png'};base64,{b64}"
    }


@router.get("/branch/{branch_id}/logo")
def get_branch_logo(
    branch_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get branch-specific logo image."""
    branch = db.query(Branch).filter(
        Branch.gymId == current_gym.id,
        Branch.id == branch_id
    ).first()

    if not branch or not branch.logoData:
        raise HTTPException(status_code=404, detail="No logo found for this branch")

    return Response(
        content=branch.logoData,
        media_type=branch.logoMimeType or "image/png"
    )
