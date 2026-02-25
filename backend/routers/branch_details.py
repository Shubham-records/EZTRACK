from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Response
from sqlalchemy.orm import Session
from typing import Optional
import base64

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, BranchDetails, Branch
from schemas.branch_details import BranchDetailsCreate, BranchDetailsUpdate, BranchDetailsResponse

router = APIRouter()


def _to_response(bd: BranchDetails) -> dict:
    """Convert BranchDetails ORM object to response dict."""
    return {
        "id": bd.id,
        "gymId": bd.gymId,
        "branchId": bd.branchId,
        "gymName": bd.gymName,
        "phone": bd.phone,
        "whatsapp": bd.whatsapp,
        "email": bd.email,
        "slogan": bd.slogan,
        "website": bd.website,
        "address": bd.address,
        "city": bd.city,
        "state": bd.state,
        "pincode": bd.pincode,
        "phoneCountryCode": bd.phoneCountryCode or '+91',
        "hasLogo": bd.logoData is not None,
    }


@router.get("")
def get_gym_details(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get gym-level details (branchId = NULL)."""
    bd = db.query(BranchDetails).filter(
        BranchDetails.gymId == current_gym.id,
        BranchDetails.branchId.is_(None)
    ).first()

    if not bd:
        # Auto-create with gym name
        bd = BranchDetails(
            gymId=current_gym.id,
            branchId=None,
            gymName=current_gym.gymname,
        )
        db.add(bd)
        db.commit()
        db.refresh(bd)

    return _to_response(bd)


@router.get("/all")
def get_all_branch_details(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get all branch details for this gym (gym-level + per-branch)."""
    details = db.query(BranchDetails).filter(
        BranchDetails.gymId == current_gym.id
    ).all()
    return [_to_response(bd) for bd in details]


@router.get("/for-invoice")
def get_details_for_invoice(
    branch_id: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Smart endpoint: returns branch-specific details if available, else gym-level fallback."""
    if branch_id:
        bd = db.query(BranchDetails).filter(
            BranchDetails.gymId == current_gym.id,
            BranchDetails.branchId == branch_id
        ).first()
        if bd:
            return _to_response(bd)

    # Fallback to gym-level
    bd = db.query(BranchDetails).filter(
        BranchDetails.gymId == current_gym.id,
        BranchDetails.branchId.is_(None)
    ).first()

    if not bd:
        bd = BranchDetails(
            gymId=current_gym.id,
            branchId=None,
            gymName=current_gym.gymname,
        )
        db.add(bd)
        db.commit()
        db.refresh(bd)

    return _to_response(bd)


@router.get("/branch/{branch_id}")
def get_branch_details(
    branch_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get details for a specific branch."""
    bd = db.query(BranchDetails).filter(
        BranchDetails.gymId == current_gym.id,
        BranchDetails.branchId == branch_id
    ).first()

    if not bd:
        raise HTTPException(status_code=404, detail="Branch details not found")

    return _to_response(bd)


@router.put("")
def update_gym_details(
    data: BranchDetailsUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Create or update gym-level details."""
    bd = db.query(BranchDetails).filter(
        BranchDetails.gymId == current_gym.id,
        BranchDetails.branchId.is_(None)
    ).first()

    if not bd:
        bd = BranchDetails(gymId=current_gym.id, branchId=None)
        db.add(bd)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(bd, key, value)

    db.commit()
    db.refresh(bd)
    return _to_response(bd)


@router.put("/branch/{branch_id}")
def update_branch_details(
    branch_id: str,
    data: BranchDetailsUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Create or update branch-specific details."""
    # Verify branch exists
    branch = db.query(Branch).filter(
        Branch.id == branch_id,
        Branch.gymId == current_gym.id
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    bd = db.query(BranchDetails).filter(
        BranchDetails.gymId == current_gym.id,
        BranchDetails.branchId == branch_id
    ).first()

    if not bd:
        bd = BranchDetails(gymId=current_gym.id, branchId=branch_id)
        db.add(bd)

    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(bd, key, value)

    db.commit()
    db.refresh(bd)
    return _to_response(bd)


@router.post("/logo")
async def upload_gym_logo(
    file: UploadFile = File(...),
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Upload gym-level logo."""
    if file.content_type not in ["image/png", "image/jpeg", "image/webp"]:
        raise HTTPException(status_code=400, detail="Only PNG, JPEG, or WebP images are allowed")

    bd = db.query(BranchDetails).filter(
        BranchDetails.gymId == current_gym.id,
        BranchDetails.branchId.is_(None)
    ).first()

    if not bd:
        bd = BranchDetails(gymId=current_gym.id, branchId=None, gymName=current_gym.gymname)
        db.add(bd)

    bd.logoData = await file.read()
    bd.logoMimeType = file.content_type
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

    bd = db.query(BranchDetails).filter(
        BranchDetails.gymId == current_gym.id,
        BranchDetails.branchId == branch_id
    ).first()

    if not bd:
        bd = BranchDetails(gymId=current_gym.id, branchId=branch_id)
        db.add(bd)

    bd.logoData = await file.read()
    bd.logoMimeType = file.content_type
    db.commit()

    return {"message": "Branch logo uploaded successfully"}


@router.get("/logo")
def get_gym_logo(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get gym-level logo image."""
    bd = db.query(BranchDetails).filter(
        BranchDetails.gymId == current_gym.id,
        BranchDetails.branchId.is_(None)
    ).first()

    if not bd or not bd.logoData:
        raise HTTPException(status_code=404, detail="No logo found")

    return Response(
        content=bd.logoData,
        media_type=bd.logoMimeType or "image/png"
    )


@router.get("/logo/base64")
def get_gym_logo_base64(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get gym-level logo as base64 string (for PDF embedding)."""
    bd = db.query(BranchDetails).filter(
        BranchDetails.gymId == current_gym.id,
        BranchDetails.branchId.is_(None)
    ).first()

    if not bd or not bd.logoData:
        return {"logo": None}

    b64 = base64.b64encode(bd.logoData).decode("utf-8")
    return {
        "logo": f"data:{bd.logoMimeType or 'image/png'};base64,{b64}"
    }


@router.get("/branch/{branch_id}/logo")
def get_branch_logo(
    branch_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get branch-specific logo image."""
    bd = db.query(BranchDetails).filter(
        BranchDetails.gymId == current_gym.id,
        BranchDetails.branchId == branch_id
    ).first()

    if not bd or not bd.logoData:
        raise HTTPException(status_code=404, detail="No logo found for this branch")

    return Response(
        content=bd.logoData,
        media_type=bd.logoMimeType or "image/png"
    )
