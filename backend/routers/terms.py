from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional
from core.database import get_db
from core.dependencies import get_current_gym, require_owner_or_manager
from models.all_models import Gym, TermsAndConditions
from schemas.terms import TermsCreate, TermsUpdate, TermsResponse

router = APIRouter()

@router.get("", response_model=List[TermsResponse])
@router.get("/", response_model=List[TermsResponse])
def get_terms(
    appliesTo: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    query = db.query(TermsAndConditions).filter(
        TermsAndConditions.gymId == current_gym.id,
        TermsAndConditions.isActive == True
    )
    
    terms = query.order_by(TermsAndConditions.sortOrder.asc(), TermsAndConditions.createdAt.asc()).all()
    
    if appliesTo:
        # In SQLAlchemy with PostgreSQL ARRAY, we can check if the value is in the array.
        # However, for simplicity and database agnostic approach, we can filter in Python or use any()
        filtered_terms = [t for t in terms if appliesTo in (t.appliesTo or [])]
        return filtered_terms
        
    return terms


@router.post("", response_model=TermsResponse)
@router.post("/", response_model=TermsResponse)
def create_term(
    data: TermsCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    new_term = TermsAndConditions(
        gymId=current_gym.id,
        text=data.text,
        appliesTo=data.appliesTo,
        sortOrder=data.sortOrder,
        isActive=data.isActive
    )
    db.add(new_term)
    db.commit()
    db.refresh(new_term)
    return new_term


@router.put("/{term_id}", response_model=TermsResponse)
def update_term(
    term_id: str,
    data: TermsUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    term = db.query(TermsAndConditions).filter(
        TermsAndConditions.id == term_id,
        TermsAndConditions.gymId == current_gym.id
    ).first()
    
    if not term:
        raise HTTPException(status_code=404, detail="Term not found")
        
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(term, key, value)
        
    db.commit()
    db.refresh(term)
    return term


@router.delete("/{term_id}")
def delete_term(
    term_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    term = db.query(TermsAndConditions).filter(
        TermsAndConditions.id == term_id,
        TermsAndConditions.gymId == current_gym.id
    ).first()
    
    if not term:
        raise HTTPException(status_code=404, detail="Term not found")
        
    term.isActive = False
    db.commit()
    return {"message": "Term deleted successfully"}
