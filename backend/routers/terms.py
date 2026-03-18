from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List, Optional
from core.database import get_async_db  # RD-01: removed unused sync get_db
from core.dependencies import get_current_gym, require_owner_or_manager
from models.all_models import Gym, TermsAndConditions
from schemas.terms import TermsCreate, TermsUpdate, TermsResponse

router = APIRouter()

@router.get("", response_model=List[TermsResponse])
@router.get("/", response_model=List[TermsResponse])
async def get_terms(
    appliesTo: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    stmt = select(TermsAndConditions).where(
        TermsAndConditions.gymId == current_gym.id,
        TermsAndConditions.isActive == True
    )
    if appliesTo:
        stmt = stmt.where(TermsAndConditions.appliesTo.any(appliesTo))

    stmt = stmt.order_by(TermsAndConditions.sortOrder.asc(), TermsAndConditions.createdAt.asc())
    res = await db.execute(stmt)
    terms = res.scalars().all()
    return terms


@router.post("", response_model=TermsResponse)
@router.post("/", response_model=TermsResponse)
async def create_term(
    data: TermsCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    new_term = TermsAndConditions(
        gymId=current_gym.id,
        text=data.text,
        appliesTo=data.appliesTo,
        sortOrder=data.sortOrder,
        isActive=data.isActive
    )
    db.add(new_term)
    await db.commit()
    # await db.refresh(new_term)
    return new_term


@router.put("/{term_id}", response_model=TermsResponse)
async def update_term(
    term_id: str,
    data: TermsUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    stmt = select(TermsAndConditions).where(
        TermsAndConditions.id == term_id,
        TermsAndConditions.gymId == current_gym.id
    )
    res = await db.execute(stmt)
    term = res.scalars().first()
    
    if not term:
        raise HTTPException(status_code=404, detail="Term not found")
        
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(term, key, value)
        
    await db.commit()
    # await db.refresh(term)
    return term


@router.delete("/{term_id}")
async def delete_term(
    term_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    stmt = select(TermsAndConditions).where(
        TermsAndConditions.id == term_id,
        TermsAndConditions.gymId == current_gym.id
    )
    res = await db.execute(stmt)
    term = res.scalars().first()
    
    if not term:
        raise HTTPException(status_code=404, detail="Term not found")
        
    term.isActive = False
    await db.commit()
    return {"message": "Term deleted successfully"}
