from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import func
from typing import List, Optional

from core.database import get_async_db
from core.dependencies import get_current_gym, require_owner_or_manager
from models.all_models import Gym, ExternalContact
from schemas.contact import ExternalContactCreate, ExternalContactUpdate, ExternalContactResponse

router = APIRouter()


def map_contact_response(c: ExternalContact):
    c_dict = c.__dict__.copy()
    c_dict['_id'] = c.id
    c_dict.pop('_sa_instance_state', None)
    return ExternalContactResponse.model_validate(c_dict).model_dump(by_alias=True)


@router.get("")
@router.get("/")
async def get_contacts(
    contact_type: Optional[str] = None,
    page: int = 1,
    page_size: int = 50,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get all external contacts."""
    stmt = select(ExternalContact).where(
        ExternalContact.gymId == current_gym.id,
        ExternalContact.isActive == True
    )
    
    if contact_type:
        stmt = stmt.where(ExternalContact.contactType == contact_type)
        
    count_stmt = select(func.count()).select_from(stmt.subquery())
    count_res = await db.execute(count_stmt)
    total = count_res.scalar()

    limit = max(1, min(page_size, 100))
    offset = (max(1, page) - 1) * limit
    
    stmt = stmt.order_by(ExternalContact.name).offset(offset).limit(limit)
    res = await db.execute(stmt)
    contacts = res.scalars().all()
    
    return {
        "items": [map_contact_response(c) for c in contacts],
        "total": total,
        "page": page,
        "size": limit
    }


@router.get("/types")
async def get_contact_types():
    """Get list of contact types (Customer, Vendor, Supplier, etc.)."""
    return [
        "Customer",
        "Vendor",
        "Supplier", 
        "Contractor",
        "Partner",
        "Other"
    ]


@router.get("/{contact_id}", response_model=ExternalContactResponse)
async def get_contact(
    contact_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get single contact by ID.
    SEC-V-09: isActive==True ensures soft-deleted contacts cannot be
    retrieved by direct ID lookup (consistent with the list endpoint).
    """
    stmt = select(ExternalContact).where(
        ExternalContact.id == contact_id,
        ExternalContact.gymId == current_gym.id,
        ExternalContact.isActive == True,  # SEC-V-09: block soft-deleted contact access
    )
    res = await db.execute(stmt)
    contact = res.scalars().first()

    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")

    return map_contact_response(contact)



@router.post("", response_model=ExternalContactResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ExternalContactResponse, status_code=status.HTTP_201_CREATED)
async def create_contact(
    data: ExternalContactCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Create a new external contact."""
    contact = ExternalContact(gymId=current_gym.id, **data.model_dump())
    db.add(contact)
    await db.commit()
    # await db.refresh(contact)
    return map_contact_response(contact)


@router.put("/{contact_id}", response_model=ExternalContactResponse)
async def update_contact(
    contact_id: str,
    data: ExternalContactUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Update an external contact.
    SEC-VULN-08: isActive==True prevents resurrecting a soft-deleted contact.
    """
    stmt = select(ExternalContact).where(
        ExternalContact.id == contact_id,
        ExternalContact.gymId == current_gym.id,
        ExternalContact.isActive == True,  # SEC-VULN-08: block updates to deleted contacts
    )
    res = await db.execute(stmt)
    contact = res.scalars().first()
    
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(contact, key, value)
    
    await db.commit()
    # await db.refresh(contact)
    return map_contact_response(contact)


@router.delete("/{contact_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_contact(
    contact_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Soft delete an external contact."""
    stmt = select(ExternalContact).where(
        ExternalContact.id == contact_id,
        ExternalContact.gymId == current_gym.id
    )
    res = await db.execute(stmt)
    contact = res.scalars().first()
    
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    
    contact.isActive = False
    await db.commit()
    return None
