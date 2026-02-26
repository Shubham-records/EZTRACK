"""
routers/branch_details.py  (v2)
================================
Changes from v1:
  - Logo upload/delete now uses core/storage.py (object storage) instead of BYTEA.
  - GET /logo now returns a short-lived signed URL instead of streaming bytes.
  - GET /logo/base64 kept for PDF generation — fetches signed URL, downloads bytes,
    encodes as base64.  This keeps PDF generation working without routing all binary
    traffic through the API.
  - logoData / logoMimeType columns replaced with logoUrl / logoMimeType in Branch model.
"""

import base64

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import Optional

from core.database import get_db
from core.dependencies import get_current_gym
from core.storage import upload_image, get_signed_url, delete_image, StorageFolder
from models.all_models import Gym, Branch
from schemas.branch_details import BranchDetailsUpdate

router = APIRouter()


# ─── Helpers ─────────────────────────────────────────────────────────────────

def _to_response(b: Branch) -> dict:
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
        "phoneCountryCode": b.phoneCountryCode or "+91",
        # hasLogo derived from logoUrl — no separate flag needed
        "hasLogo": bool(b.logoUrl),
        # Return signed URL if logo exists, else None.
        # Signed URL is generated on every response — valid for STORAGE_SIGNED_URL_EXPIRY seconds.
        # Frontend should NOT cache this URL beyond its expiry.
        "logoUrl": get_signed_url(b.logoUrl) if b.logoUrl else None,
    }


def _get_default_branch(gym_id: str, db: Session) -> Branch:
    branch = db.query(Branch).filter(
        Branch.gymId == gym_id,
        Branch.isDefault == True,
    ).first()

    if not branch:
        branch = db.query(Branch).filter(Branch.gymId == gym_id).first()

    if not branch:
        gym = db.query(Gym).filter(Gym.id == gym_id).first()
        branch = Branch(
            gymId=gym_id,
            name=gym.gymname,
            displayName=gym.gymname,
            isActive=True,
            isDefault=True,
        )
        db.add(branch)
        db.commit()
        db.refresh(branch)

    return branch


# ─── GET endpoints ────────────────────────────────────────────────────────────

@router.get("")
def get_gym_details(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """Get gym-level details (default branch)."""
    branch = _get_default_branch(current_gym.id, db)
    return _to_response(branch)


@router.get("/all")
def get_all_branch_details(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """Get all branch details for this gym."""
    branches = db.query(Branch).filter(Branch.gymId == current_gym.id).all()
    if not branches:
        branches = [_get_default_branch(current_gym.id, db)]
    return [_to_response(b) for b in branches]


@router.get("/for-invoice")
def get_details_for_invoice(
    branch_id: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """Smart endpoint: branch-specific details if available, else default branch."""
    if branch_id:
        branch = db.query(Branch).filter(
            Branch.gymId == current_gym.id,
            Branch.id == branch_id,
        ).first()
        if branch:
            return _to_response(branch)
    return _to_response(_get_default_branch(current_gym.id, db))


@router.get("/branch/{branch_id}")
def get_branch_details(
    branch_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """Get details for a specific branch."""
    branch = db.query(Branch).filter(
        Branch.gymId == current_gym.id,
        Branch.id == branch_id,
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")
    return _to_response(branch)


# ─── PUT endpoints ────────────────────────────────────────────────────────────

@router.put("")
def update_gym_details(
    data: BranchDetailsUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """Update gym-level details (default branch)."""
    branch = _get_default_branch(current_gym.id, db)
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
    db: Session = Depends(get_db),
):
    """Update a specific branch's details."""
    branch = db.query(Branch).filter(
        Branch.id == branch_id,
        Branch.gymId == current_gym.id,
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


# ─── Logo upload endpoints ────────────────────────────────────────────────────

@router.post("/logo")
async def upload_gym_logo(
    file: UploadFile = File(...),
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """
    Upload gym-level logo.
    Stores image in object storage (Supabase / R2 / S3).
    Returns a signed URL valid for STORAGE_SIGNED_URL_EXPIRY seconds.
    """
    branch = _get_default_branch(current_gym.id, db)
    data = await file.read()

    # Delete old logo if one exists
    if branch.logoUrl:
        delete_image(branch.logoUrl)

    # Upload new logo — returns storage key (not a URL)
    storage_key = upload_image(data, folder=StorageFolder.LOGOS, mime_type=file.content_type)

    branch.logoUrl      = storage_key
    branch.logoMimeType = file.content_type
    db.commit()

    return {
        "message": "Logo uploaded successfully",
        "logoUrl": get_signed_url(storage_key),
    }


@router.post("/branch/{branch_id}/logo")
async def upload_branch_logo(
    branch_id: str,
    file: UploadFile = File(...),
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """Upload logo for a specific branch."""
    branch = db.query(Branch).filter(
        Branch.gymId == current_gym.id,
        Branch.id == branch_id,
    ).first()
    if not branch:
        raise HTTPException(status_code=404, detail="Branch not found")

    data = await file.read()

    if branch.logoUrl:
        delete_image(branch.logoUrl)

    storage_key = upload_image(data, folder=StorageFolder.LOGOS, mime_type=file.content_type)
    branch.logoUrl      = storage_key
    branch.logoMimeType = file.content_type
    db.commit()

    return {
        "message": "Branch logo uploaded successfully",
        "logoUrl": get_signed_url(storage_key),
    }


# ─── Logo signed URL endpoints ────────────────────────────────────────────────

@router.get("/logo")
def get_gym_logo_url(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """
    Get a fresh signed URL for the gym logo.
    Frontend should call this endpoint each time it needs to display the logo.
    Do NOT cache the URL on the frontend beyond its expiry window.
    """
    branch = _get_default_branch(current_gym.id, db)
    if not branch.logoUrl:
        raise HTTPException(status_code=404, detail="No logo found")
    return {"logoUrl": get_signed_url(branch.logoUrl)}


@router.get("/logo/base64")
def get_gym_logo_base64(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """
    Get gym logo as base64 string for PDF embedding.
    Fetches the object via signed URL and encodes it in-memory.
    This keeps PDF generation working without storing binary in DB.
    """
    branch = _get_default_branch(current_gym.id, db)
    if not branch.logoUrl:
        return {"logo": None}

    signed_url = get_signed_url(branch.logoUrl)

    try:
        response = httpx.get(signed_url, timeout=10)
        response.raise_for_status()
        b64 = base64.b64encode(response.content).decode("utf-8")
        mime = branch.logoMimeType or "image/png"
        return {"logo": f"data:{mime};base64,{b64}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not fetch logo for PDF: {e}")


@router.get("/branch/{branch_id}/logo")
def get_branch_logo_url(
    branch_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """Get a fresh signed URL for a specific branch logo."""
    branch = db.query(Branch).filter(
        Branch.gymId == current_gym.id,
        Branch.id == branch_id,
    ).first()
    if not branch or not branch.logoUrl:
        raise HTTPException(status_code=404, detail="No logo found for this branch")
    return {"logoUrl": get_signed_url(branch.logoUrl)}


# ─── Logo delete endpoints ────────────────────────────────────────────────────

@router.delete("/logo")
def delete_gym_logo(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
):
    """Delete the gym logo from object storage."""
    branch = _get_default_branch(current_gym.id, db)
    if not branch.logoUrl:
        raise HTTPException(status_code=404, detail="No logo to delete")
    delete_image(branch.logoUrl)
    branch.logoUrl      = None
    branch.logoMimeType = None
    db.commit()
    return {"message": "Logo deleted"}
