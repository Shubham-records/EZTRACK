from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Optional

from core.database import get_db
from core.dependencies import get_current_gym, require_owner_or_manager
from models.all_models import Gym, ExternalContact
from schemas.pending import ExternalContactCreate, ExternalContactUpdate, ExternalContactResponse

router = APIRouter()


def map_contact_response(c: ExternalContact):
    c_dict = c.__dict__.copy()
    c_dict['_id'] = c.id
    c_dict.pop('_sa_instance_state', None)
    return c_dict


@router.get("", response_model=List[ExternalContactResponse])
@router.get("/", response_model=List[ExternalContactResponse])
def get_contacts(
    contact_type: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get all external contacts."""
    query = db.query(ExternalContact).filter(
        ExternalContact.gymId == current_gym.id,
        ExternalContact.isActive == True
    )
    
    if contact_type:
        query = query.filter(ExternalContact.contactType == contact_type)
    
    contacts = query.order_by(ExternalContact.name).all()
    return [map_contact_response(c) for c in contacts]


@router.get("/types")
def get_contact_types():
    """Get list of contact types."""
    return ["vendor", "service", "consultant", "partner", "other"]


@router.get("/{contact_id}", response_model=ExternalContactResponse)
def get_contact(
    contact_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get single contact by ID."""
    contact = db.query(ExternalContact).filter(
        ExternalContact.id == contact_id,
        ExternalContact.gymId == current_gym.id
    ).first()
    
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    return map_contact_response(contact)


@router.post("", response_model=ExternalContactResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ExternalContactResponse, status_code=status.HTTP_201_CREATED)
def create_contact(
    data: ExternalContactCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Create a new external contact."""
    contact = ExternalContact(gymId=current_gym.id, **data.model_dump())
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return map_contact_response(contact)


@router.put("/{contact_id}", response_model=ExternalContactResponse)
def update_contact(
    contact_id: str,
    data: ExternalContactUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Update an external contact."""
    contact = db.query(ExternalContact).filter(
        ExternalContact.id == contact_id,
        ExternalContact.gymId == current_gym.id
    ).first()
    
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(contact, key, value)
    
    db.commit()
    db.refresh(contact)
    return map_contact_response(contact)


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(
    contact_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Soft delete an external contact."""
    contact = db.query(ExternalContact).filter(
        ExternalContact.id == contact_id,
        ExternalContact.gymId == current_gym.id
    ).first()
    
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    contact.isActive = False
    db.commit()
    return None
