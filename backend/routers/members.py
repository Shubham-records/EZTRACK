import logging
from fastapi import APIRouter, Depends, HTTPException, status, Request, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, delete
from sqlalchemy import or_, func, String
from typing import List, Optional
from datetime import datetime, date, timedelta

from core.database import get_async_db
from core.dependencies import get_current_gym, require_owner_or_manager, require_owner
from core.date_utils import parse_date, format_date
from core.cache import get_gym_settings, get_async_gym_settings, LRUTTLCache
from core.aadhaar_crypto import encrypt_aadhaar, decrypt_aadhaar, hash_aadhaar, mask_aadhaar
from models.all_models import Gym, Member, Invoice, GymSettings, PaymentEvent, GymSubscription
from schemas.member import MemberCreate, MemberResponse, MemberUpdate
from core.audit_utils import log_audit
from services.member_service import process_member_creation, process_re_admission, process_renew_member
from core.rate_limit import rate_limit

logger = logging.getLogger(__name__)
router = APIRouter()

# PB-04: Per-gym member count cache (5 min TTL) to avoid full-table count on every page
_member_count_cache = LRUTTLCache(maxsize=500, ttl=300)


def calculate_member_status(member: Member, admission_expiry_days: int = 365) -> dict:
    today = datetime.now().date()
    status_data = {
        "computed_status":      member.status_computed or "Inactive",  # SW-08: prefer stored column
        "is_expired":           False,
        "days_until_expiry":    None,
        "admission_expiry_date": None,
        "is_admission_expired": False,
    }

    # NextDuedate is a native Date column — no parsing needed
    if member.NextDuedate:
        due_date = member.NextDuedate
        delta = (due_date - today).days
        status_data["days_until_expiry"] = delta

        # If stored column is missing, fall back to calculation
        if not member.status_computed:
            if due_date < today:
                status_data["computed_status"] = "Expired"
            else:
                status_data["computed_status"] = "Active"

        status_data["is_expired"] = (status_data["computed_status"] == "Expired")

        admission_expiry_date = due_date + timedelta(days=admission_expiry_days)
        status_data["admission_expiry_date"] = format_date(admission_expiry_date)
        status_data["is_admission_expired"] = today > admission_expiry_date

    return status_data

def map_member_response(member: Member, admission_expiry_days: int = 365, decrypt: bool = True):
    """
    Map a Member ORM object to a response dict.

    PB-01: When decrypt=False (list views), Aadhaar is NOT decrypted — saves
    one Fernet decrypt call per member row. At 10K DAU with page_size=50,
    this eliminates 50 crypto operations per list request. Single-member
    detail views pass decrypt=True (default) to get the masked XXXX-XXXX-NNNN value.
    """
    m_dict = member.__dict__.copy()
    m_dict['_id'] = member.id

    # Phone are String(15) in v2 — cast to str for safety
    for field in ('Mobile', 'Whatsapp'):
        val = m_dict.get(field)
        m_dict[field] = str(val) if val is not None else None

    # SEC-05 / SCH-07 / PB-01: Decrypt Fernet ciphertext only for detail views.
    # List views skip decryption entirely — Aadhaar is not shown in lists anyway.
    if decrypt:
        raw_aadhaar = m_dict.get('Aadhaar')
        if raw_aadhaar:
            plaintext = decrypt_aadhaar(raw_aadhaar)   # decrypt encrypted DB value
            m_dict['Aadhaar'] = mask_aadhaar(plaintext)  # mask to XXXX-XXXX-NNNN
        else:
            m_dict['Aadhaar'] = None
    else:
        # PB-01: Skip decryption in list views — always null in list context
        m_dict['Aadhaar'] = None

    # Never return the HMAC hash to clients
    m_dict.pop('AadhaarHash', None)


    # v1 leftovers — remove silently if still in __dict__
    m_dict.pop('AccessStatus',        None)
    m_dict.pop('imageData',           None)
    m_dict.pop('_sa_instance_state',  None)

    m_dict['hasImage'] = bool(getattr(member, 'hasImage', False))

    # Format all date fields as DD/MM/YYYY
    for field in ('DateOfJoining', 'DateOfReJoin', 'MembershipExpiryDate', 'LastPaymentDate', 'NextDuedate'):
        m_dict[field] = format_date(getattr(member, field, None))

    status_info = calculate_member_status(member, admission_expiry_days)
    m_dict.update(status_info)
    # Keep MembershipStatus as an alias of computed_status for backward-compat with frontend
    m_dict['MembershipStatus'] = status_info['computed_status']

    from core.storage import get_signed_url_or_none
    m_dict['imageUrl'] = get_signed_url_or_none(getattr(member, 'imageUrl', None))

    return MemberResponse.model_validate(m_dict).model_dump(by_alias=True)

@router.get("/generate-client-number")
async def generate_client_number(current_gym: Gym = Depends(get_current_gym), db: AsyncSession = Depends(get_async_db)):
    """Generate the next available client number.
    Uses SELECT ... FOR UPDATE to serialize concurrent requests per gym.
    """
    try:
        # Lock the gym row to serialize concurrent receipt number generation
        gym_stmt = select(Gym).where(Gym.id == current_gym.id).with_for_update()
        await db.execute(gym_stmt)
        
        max_num_stmt = select(func.max(Member.MembershipReceiptnumber)).where(
            Member.gymId == current_gym.id,
        )
        max_res = await db.execute(max_num_stmt)
        max_number = max_res.scalar()
        
        next_number = (max_number or 0) + 1
        return {"clientNumber": next_number}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




@router.get("")
@router.get("/")
@rate_limit("200/minute")
async def get_members(
    request: Request,
    page: int = 1,
    page_size: int = 30,
    search: str = "",
    status_filter: str = "",
    cursor: Optional[str] = None, # PB-04: Keyset pagination cursor (createdAt ISO string)
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    # ARCH-06: Enforce max page_size=500, no page_size=0 bypass
    page_size = max(1, min(page_size, 500))
    # FIX: use cache.py (10-min TTL) instead of raw DB query for GymSettings
    settings = await get_async_gym_settings(current_gym.id, db)
    admission_expiry_days = settings.admissionExpiryDays if settings and settings.admissionExpiryDays else 365

    # Base query for data
    stmt = select(Member).where(
        Member.gymId == current_gym.id,
        Member.isDeleted == False
    )
    
    # Base query for count
    count_stmt = select(func.count(Member.id)).where(
        Member.gymId == current_gym.id,
        Member.isDeleted == False
    )

    # Apply filters
    if search:
        search_term = f"%{search}%"
        filter_clause = or_(
            Member.Name.ilike(search_term),
            Member.Mobile.ilike(search_term),
            Member.Whatsapp.ilike(search_term),
            Member.MembershipReceiptnumber.cast(String).ilike(search_term),
        )
        stmt = stmt.where(filter_clause)
        count_stmt = count_stmt.where(filter_clause)

    if status_filter:
        # SW-08: Use stored column for index-backed filtering
        stmt = stmt.where(Member.status_computed == status_filter)
        count_stmt = count_stmt.where(Member.status_computed == status_filter)

    # Cache total count to prevent full table scans on every page (PB-04)
    # Cache key includes search and status_filter to be accurate
    cache_key = f"{current_gym.id}:{search}:{status_filter}"
    cached_count_entry = _member_count_cache.get(cache_key)
    if cached_count_entry:
        total = cached_count_entry["data"]
    else:
        res_count = await db.execute(count_stmt)
        total = res_count.scalar() or 0
        _member_count_cache.set(cache_key, {"data": total, "ts": datetime.now()})

    # PB-04: Keyset pagination
    if cursor:
        cursor_date = parse_date(cursor)
        if cursor_date:
            stmt = stmt.where(Member.createdAt < cursor_date)
            # When using cursor, ignore OFFSET
            offset = 0
        else:
            offset = (page - 1) * page_size
    else:
        offset = (page - 1) * page_size

    # Fetch page_size + 1 to determine hasMore
    stmt = stmt.order_by(Member.createdAt.desc()).offset(offset).limit(page_size + 1)
    res = await db.execute(stmt)
    members_fetched = res.scalars().all()
    
    has_more = len(members_fetched) > page_size
    members = members_fetched[:page_size]
    
    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 1
    next_cursor = members[-1].createdAt.isoformat() if members and members[-1].createdAt else None

    return {
        "data":       [map_member_response(m, admission_expiry_days, decrypt=False) for m in members],  # PB-01: no Fernet decrypt in list
        "total":      total,
        "page":       page,
        "pageSize":   page_size,
        "totalPages": total_pages,
        "hasMore":    has_more,
        "nextCursor": next_cursor
    }


@router.get("/export", dependencies=[Depends(require_owner)])
@rate_limit("5/minute")
async def export_members(
    request: Request,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Gated export endpoint for gym owners. Limited to 1000 records."""
    settings = await get_async_gym_settings(current_gym.id, db)
    admission_expiry_days = settings.admissionExpiryDays if settings and settings.admissionExpiryDays else 365
    
    stmt = select(Member).where(
        Member.gymId == current_gym.id
    ).order_by(Member.createdAt.desc()).limit(1000)
    res = await db.execute(stmt)
    members = res.scalars().all()
    
    return {
        "data":       [map_member_response(m, admission_expiry_days, decrypt=False) for m in members],  # PB-01: no Fernet decrypt in export list
        "total":      len(members),
        "page":       1,
        "pageSize":   len(members),
        "totalPages": 1,
    }


@router.post("/search-duplicates")
async def search_duplicates(data: dict, current_gym: Gym = Depends(get_current_gym), db: AsyncSession = Depends(get_async_db)):
    """Search for potential duplicates based on Name, Mobile, Whatsapp, or Aadhaar.

    SEC-NEW-09: Returns minimal fields only — {id, Name, masked_phone}.
    Full member objects must NOT be returned here; this endpoint is accessible to all
    authenticated roles including STAFF and could leak sensitive data if it returned
    phone numbers, addresses, or masked Aadhaar to lower-privilege callers.

    ARCH-NEW-05: Aadhaar matching now uses AadhaarHash (HMAC) — the Aadhaar column
    stores Fernet ciphertext which can never match a raw 12-digit number.
    """
    name = data.get("Name")
    mobile = data.get("Mobile")
    whatsapp = data.get("Whatsapp")
    aadhaar = data.get("Aadhaar")

    if not any([name, mobile, whatsapp, aadhaar]):
        return []

    conditions = []
    if name:
        conditions.append(Member.Name == name)
    if mobile:
        conditions.append(Member.Mobile == str(mobile))
    if whatsapp:
        conditions.append(Member.Whatsapp == str(whatsapp))
    if aadhaar:
        conditions.append(Member.AadhaarHash == hash_aadhaar(str(aadhaar).strip()))
            
    if not conditions:
        return []

    # Find matches
    stmt = select(Member).where(
        Member.gymId == current_gym.id,
        or_(*conditions)
    )
    res = await db.execute(stmt)
    matches = res.scalars().all()

    # SEC-NEW-09: Return minimal safe fields only — no phone numbers, no addresses, no Aadhaar
    return [
        {
            "id": m.id,
            "Name": m.Name,
            "MembershipReceiptnumber": m.MembershipReceiptnumber,
        }
        for m in matches
    ]

@router.post("/check-duplicates")
async def check_duplicates(data: dict, current_gym: Gym = Depends(get_current_gym), db: AsyncSession = Depends(get_async_db)):
    """Check for duplicate members before import. Uses batched queries instead of N+1."""
    members_list = data.get("members", [])
    conflicts = []
    clean = []

    # Collect all names and phone numbers from the import batch
    all_names = {m.get("Name", "").strip() for m in members_list if m.get("Name")}
    all_phones = set()
    for m in members_list:
        if m.get("Mobile"):
            all_phones.add(str(m["Mobile"]))
        if m.get("Whatsapp"):
            all_phones.add(str(m["Whatsapp"]))

    # Two queries instead of N
    existing_by_name = {}
    if all_names:
        n_stmt = select(Member).where(
            Member.gymId == current_gym.id,
            Member.Name.in_(all_names),
        )
        n_res = await db.execute(n_stmt)
        rows = n_res.scalars().all()
        for r in rows:
            existing_by_name[r.Name] = r

    existing_by_phone = {}
    if all_phones:
        p_stmt = select(Member).where(
            Member.gymId == current_gym.id,
            or_(Member.Mobile.in_(all_phones), Member.Whatsapp.in_(all_phones)),
        )
        p_res = await db.execute(p_stmt)
        rows = p_res.scalars().all()
        for r in rows:
            if r.Mobile:
                existing_by_phone[r.Mobile] = r
            if r.Whatsapp:
                existing_by_phone[r.Whatsapp] = r

    # Match each import row against the pre-fetched sets
    for member_data in members_list:
        name = member_data.get("Name", "").strip()
        mobile = str(member_data.get("Mobile", "")) if member_data.get("Mobile") else None
        whatsapp = str(member_data.get("Whatsapp", "")) if member_data.get("Whatsapp") else None

        existing = existing_by_name.get(name)
        matched_on = "Name"
        if not existing and mobile:
            existing = existing_by_phone.get(mobile)
            matched_on = "Mobile/Whatsapp"
        if not existing and whatsapp:
            existing = existing_by_phone.get(whatsapp)
            matched_on = "Mobile/Whatsapp"

        if existing:
            # SEC-NEW-09: Return minimal safe fields only
            conflicts.append({
                "importData": member_data,
                "existingMember": {
                    "id": existing.id,
                    "Name": existing.Name,
                    "maskedPhone": existing.Mobile[:2] + "******" + existing.Mobile[-2:] if existing.Mobile and len(existing.Mobile) >= 4 else None,
                    "DateOfJoining": format_date(existing.DateOfJoining),
                },
                "matchedOn": matched_on,
            })
        else:
            clean.append(member_data)

    return {
        "conflicts": conflicts,
        "clean": clean,
        "conflictCount": len(conflicts),
        "cleanCount": len(clean),
    }


@router.post("/bulk-create", status_code=202)
@rate_limit("5/minute")
async def bulk_create_members(
    request: Request,
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),
):
    """SW-06: Bulk create members — returns 202 with jobId, processes in background."""
    import asyncio
    from core.job_utils import create_job, update_job, complete_job, fail_job
    from core.database import AsyncSessionLocal

    members_list = data.get("members", [])

    # SEC-14: Enforce maxMembers subscription limit (runs inline before 202)
    sub_stmt = select(GymSubscription).where(
        GymSubscription.gymId == current_gym.id
    )
    sub_res = await db.execute(sub_stmt)
    subscription = sub_res.scalars().first()
    
    if subscription and subscription.maxMembers and subscription.maxMembers > 0:
        c_stmt = select(func.count(Member.id)).where(
            Member.gymId == current_gym.id,
            Member.isDeleted == False,
        )
        c_res = await db.execute(c_stmt)
        current_count = c_res.scalar() or 0
        
        remaining = subscription.maxMembers - current_count
        if remaining <= 0:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Member limit reached ({subscription.maxMembers}). Upgrade your plan to add more members.",
            )
        if len(members_list) > remaining:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=f"Import would exceed member limit. You can add {remaining} more members (limit: {subscription.maxMembers}).",
            )

    # Small imports (≤100 rows) — process inline for snappy UX
    if len(members_list) <= 100:
        created_count = 0
        failed_count = 0
        batch_size = 100
        for i in range(0, len(members_list), batch_size):
            batch = members_list[i : i + batch_size]
            try:
                async with db.begin_nested():
                    for member_data in batch:
                        new_member = Member(
                            gymId=current_gym.id,
                            Name=member_data.get("Name"),
                            MembershipReceiptnumber=member_data.get("MembershipReceiptnumber"),
                            Gender=member_data.get("Gender"),
                            Age=int(member_data.get("Age")) if member_data.get("Age") else None,
                            height=float(member_data.get("height")) if member_data.get("height") else None,
                            weight=int(member_data.get("weight")) if member_data.get("weight") else None,
                            DateOfJoining=parse_date(member_data.get("DateOfJoining")),
                            DateOfReJoin=parse_date(member_data.get("DateOfReJoin")),
                            Billtype=member_data.get("Billtype"),
                            Address=member_data.get("Address"),
                            Whatsapp=str(member_data.get("Whatsapp")) if member_data.get("Whatsapp") else None,
                            PlanPeriod=member_data.get("PlanPeriod"),
                            PlanType=member_data.get("PlanType"),
                            MembershipExpiryDate=parse_date(member_data.get("MembershipExpiryDate")),
                            LastPaymentDate=parse_date(member_data.get("LastPaymentDate")),
                            NextDuedate=parse_date(member_data.get("NextDuedate")),
                            LastPaymentAmount=float(member_data.get("LastPaymentAmount")) if member_data.get("LastPaymentAmount") else None,
                            RenewalReceiptNumber=member_data.get("RenewalReceiptNumber"),
                            Aadhaar=str(member_data.get("Aadhaar")) if member_data.get("Aadhaar") else None,
                            Remark=member_data.get("Remark"),
                            Mobile=str(member_data.get("Mobile")) if member_data.get("Mobile") else None,
                            extraDays=int(member_data.get("extraDays") or 0),
                            agreeTerms=member_data.get("agreeTerms") in [True, "true", "True", "1", 1],
                            lastEditedBy=current_gym.username,
                            editReason='Bulk Import'
                        )
                        db.add(new_member)
                    await db.flush()
                created_count += len(batch)
            except Exception as e:
                logger.error("Bulk member batch %d failed: %s", i // batch_size, type(e).__name__)
                failed_count += len(batch)
                continue
        from routers.dashboard import invalidate_dashboard_stats
        await invalidate_dashboard_stats(current_gym.id, db)
        await db.commit()
        return {"message": f"Created {created_count} members, {failed_count} failed", "count": created_count, "failed": failed_count}

    # Large imports (>100 rows) — offload to background task
    job = create_job(current_gym.id, "bulk_create_members", total=len(members_list))
    gym_id = current_gym.id
    gym_username = current_gym.username

    async def _bg_bulk_create_members():
        created_count = 0
        failed_count = 0
        batch_size = 100
        try:
            async with AsyncSessionLocal() as bg_db:
                from sqlalchemy import text
                await bg_db.execute(text("SET app.current_gym_id = :gym_id"), {"gym_id": gym_id})

                for i in range(0, len(members_list), batch_size):
                    batch = members_list[i : i + batch_size]
                    try:
                        async with bg_db.begin_nested():
                            for member_data in batch:
                                new_member = Member(
                                    gymId=gym_id,
                                    Name=member_data.get("Name"),
                                    MembershipReceiptnumber=member_data.get("MembershipReceiptnumber"),
                                    Gender=member_data.get("Gender"),
                                    Age=int(member_data.get("Age")) if member_data.get("Age") else None,
                                    height=float(member_data.get("height")) if member_data.get("height") else None,
                                    weight=int(member_data.get("weight")) if member_data.get("weight") else None,
                                    DateOfJoining=parse_date(member_data.get("DateOfJoining")),
                                    DateOfReJoin=parse_date(member_data.get("DateOfReJoin")),
                                    Billtype=member_data.get("Billtype"),
                                    Address=member_data.get("Address"),
                                    Whatsapp=str(member_data.get("Whatsapp")) if member_data.get("Whatsapp") else None,
                                    PlanPeriod=member_data.get("PlanPeriod"),
                                    PlanType=member_data.get("PlanType"),
                                    MembershipExpiryDate=parse_date(member_data.get("MembershipExpiryDate")),
                                    LastPaymentDate=parse_date(member_data.get("LastPaymentDate")),
                                    NextDuedate=parse_date(member_data.get("NextDuedate")),
                                    LastPaymentAmount=float(member_data.get("LastPaymentAmount")) if member_data.get("LastPaymentAmount") else None,
                                    RenewalReceiptNumber=member_data.get("RenewalReceiptNumber"),
                                    Aadhaar=str(member_data.get("Aadhaar")) if member_data.get("Aadhaar") else None,
                                    Remark=member_data.get("Remark"),
                                    Mobile=str(member_data.get("Mobile")) if member_data.get("Mobile") else None,
                                    extraDays=int(member_data.get("extraDays") or 0),
                                    agreeTerms=member_data.get("agreeTerms") in [True, "true", "True", "1", 1],
                                    lastEditedBy=gym_username,
                                    editReason='Bulk Import'
                                )
                                bg_db.add(new_member)
                            await bg_db.flush()
                        created_count += len(batch)
                    except Exception as e:
                        logger.error("BG bulk member batch %d failed: %s", i // batch_size, type(e).__name__)
                        failed_count += len(batch)
                        continue
                    update_job(job.id, created_count + failed_count)

                from routers.dashboard import invalidate_dashboard_stats
                await invalidate_dashboard_stats(gym_id, bg_db)
                await bg_db.commit()
            complete_job(job.id, {"count": created_count, "failed": failed_count})
        except Exception as exc:
            logger.exception("BG bulk_create_members job %s crashed", job.id)
            fail_job(job.id, str(exc))

    asyncio.create_task(_bg_bulk_create_members())
    return {"jobId": job.id, "message": f"Import of {len(members_list)} members started in background. Poll GET /api/jobs/{job.id} for status."}


@router.post("/bulk-delete")
async def bulk_delete_members(
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Bulk delete members (soft-delete)"""
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    # Check if all members belong to current gym
    # We can delete in one query for efficiency
    try:
        from datetime import datetime, timezone
        
        # Soft delete instead of hard delete
        stmt = update(Member).where(
            Member.id.in_(ids),
            Member.gymId == current_gym.id
        ).values(isDeleted=True, deletedAt=datetime.now(timezone.utc))
        
        result = await db.execute(stmt)
        
        from routers.dashboard import invalidate_dashboard_stats
        await invalidate_dashboard_stats(current_gym.id, db)
        
        await db.commit()
        return {"message": f"Deleted {result.rowcount} members", "count": result.rowcount}
    except Exception as e:
        await db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk-update")
async def bulk_update_members(
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),
):
    """Bulk update members from import merge. Requires MANAGER+."""
    members_list = data.get("members", [])
    updated_count = 0
    
    for member_data in members_list:
        member_id = member_data.get("id")
        if not member_id:
            continue
            
        stmt = select(Member).where(Member.id == member_id, Member.gymId == current_gym.id)
        res = await db.execute(stmt)
        member = res.scalars().first()
        if not member:
            continue
        
        # Update fields
        for key, value in member_data.items():
            key = str(key)  # Pyre2: key is `object` from dict — cast to str
            if key in ['id', '_id', 'gymId', 'createdAt', 'updatedAt']:
                continue
            if hasattr(member, key) and value is not None:
                try:
                    if key in ['Age', 'weight']:
                        value = int(str(value)) if value else None
                    elif key == 'LastPaymentAmount':
                        value = float(str(value)) if value else None
                    elif key in ['Mobile', 'Whatsapp', 'Aadhaar']:
                        value = str(value) if value else None
                    elif key == 'height':
                        value = float(str(value)) if value else None
                    old_val = getattr(member, key, None)
                    if old_val != value:
                        setattr(member, key, value)
                except Exception:
                    pass
        
        member.lastEditedBy = current_gym.username
        member.editReason = 'Bulk Update/Merge'
        updated_count += 1
    
    from routers.dashboard import invalidate_dashboard_stats
    await invalidate_dashboard_stats(current_gym.id, db)
    await db.commit()
    return {"message": f"Updated {updated_count} members", "count": updated_count}

@router.post("/re-admission", status_code=status.HTTP_200_OK)
async def re_admission(
    data: MemberCreate, 
    current_gym: Gym = Depends(get_current_gym), 
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),
):
    """Re-activate a member and create invoice"""
    try:
        member = await process_re_admission(
            db=db,
            gym_id=current_gym.id,
            gym_username=current_gym.username,
            data=data
        )
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg:
            raise HTTPException(status_code=404, detail=error_msg)
        else:
            raise HTTPException(status_code=400, detail=error_msg)

    # ONE commit for both member update + invoice (atomic)
    try:
        await db.flush()  # populate IDs for audit
        log_audit(db, current_gym.id, "Member", member.id, "UPDATE",
                  {"action": "Re-Admission", "PlanType": data.PlanType, "PlanPeriod": data.PlanPeriod},
                  current_gym.username)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    # await db.refresh(member)
    return {
        "message": "Re-instate member successfully",
        "id": member.id,
        "invoiceCreated": (data.LastPaymentAmount is not None and data.LastPaymentAmount > 0),
        **map_member_response(member)
    }

@router.post("/renewal", status_code=status.HTTP_200_OK)
async def renew_member(
    data: MemberCreate, 
    current_gym: Gym = Depends(get_current_gym), 
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),
):
    """Renew a member's plan and create invoice"""
    try:
        member = await process_renew_member(
            db=db,
            gym_id=current_gym.id,
            gym_username=current_gym.username,
            data=data
        )
    except ValueError as e:
        error_msg = str(e)
        if "not found" in error_msg:
            raise HTTPException(status_code=404, detail=error_msg)
        else:
            raise HTTPException(status_code=400, detail=error_msg)

    # ONE commit for both member update + invoice (atomic)
    try:
        await db.flush()
        log_audit(db, current_gym.id, "Member", member.id, "UPDATE",
                  {"action": "Renewal", "PlanType": data.PlanType, "PlanPeriod": data.PlanPeriod},
                  current_gym.username)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    # await db.refresh(member)
    return {
        "message": "Renewal successful",
        "id": member.id,
        "invoiceCreated": (data.LastPaymentAmount is not None and data.LastPaymentAmount > 0),
        **map_member_response(member)
    }

@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
@rate_limit("30/minute")
async def create_member(
    data: MemberCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),   # SEC-HIGH-01: MANAGER+ can create members
):
    """Create a new member (admission). SEC-14: Enforces subscription maxMembers limit."""
    try:
        new_member = await process_member_creation(
            db=db,
            gym_id=current_gym.id,
            gym_username=current_gym.username,
            data=data
        )
    except ValueError as e:
        error_msg = str(e)
        if "Member limit reached" in error_msg:
            raise HTTPException(status_code=status.HTTP_402_PAYMENT_REQUIRED, detail=error_msg)
        elif "A member with this Aadhaar" in error_msg:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=error_msg)
        else:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error_msg)

    log_audit(db, current_gym.id, "Member", new_member.id, "CREATE",
              {"Name": data.Name, "PlanType": data.PlanType, "PlanPeriod": data.PlanPeriod},
              current_gym.username)
    
    await db.commit()
    
    response_data = map_member_response(new_member)
    # Return custom dict structure as per Next.js
    return {
        "message": "New admission added successfully",
        "id": new_member.id,
        "invoiceCreated": (data.LastPaymentAmount is not None and data.LastPaymentAmount > 0),
        **response_data 
    }

async def _apply_member_update(member: Member, update_data: MemberUpdate, current_gym: Gym, db: AsyncSession):
    changed = {}
    date_keys = {'DateOfJoining', 'DateOfReJoin', 'MembershipExpiryDate', 'LastPaymentDate', 'NextDuedate'}
    
    # Exclude unset fields by default, fallback to dict if older Pydantic
    try:
        updatable_data = update_data.model_dump(exclude_unset=True)
    except AttributeError:
        updatable_data = update_data.dict(exclude_unset=True)

    # Extra safety: remove keys we should never update directly
    for k in ['id', '_id', 'gymId', 'createdAt', 'updatedAt', 'lastEditedBy', 'tableData', 'isDeleted', 'deletedAt', 'AadhaarHash', 'hasImage', 'imageUrl']:
        updatable_data.pop(k, None)

    for key, value in updatable_data.items():
        key = str(key)  # Pyre2: key is `object` from dict — cast to str
        if hasattr(member, key):
            try:
                # Value coercion
                if key in ['Age', 'weight', 'MembershipReceiptnumber', 'RenewalReceiptNumber']:
                    value = int(str(value)) if value is not None and str(value).strip() != '' else None
                elif key in ['LastPaymentAmount']:
                    value = float(str(value)) if value is not None and str(value).strip() != '' else None
                elif key in ['Mobile', 'Whatsapp', 'Aadhaar']:
                    value = str(value) if value is not None and str(value).strip() != '' else None
                elif key in ['height']:
                    value = float(str(value)) if value is not None and str(value).strip() != '' else None
                elif key in date_keys:
                    value = parse_date(str(value) if value is not None else None)
                    
                old_val = getattr(member, key, None)
                if old_val != value:
                    changed[key] = {
                        "from": str(old_val) if hasattr(old_val, 'isoformat') else old_val,
                        "to": str(value) if hasattr(value, 'isoformat') else value
                    }
                    setattr(member, key, value)
            except Exception:
                pass
                
    member.lastEditedBy = current_gym.username
    member.editReason = updatable_data.get('editReason', update_data.editReason) or 'Update via Web'
    
    if changed:
        log_audit(db, current_gym.id, "Member", member.id, "UPDATE", changed, current_gym.username)

@router.patch("/{id}", response_model=MemberResponse)
@router.put("/{id}", response_model=MemberResponse)
async def update_member(
    id: str,
    data: MemberUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),
):
    """Update member details. Used by both PUT and PATCH for compatibility."""
    stmt = select(Member).where(Member.id == id, Member.gymId == current_gym.id)
    res = await db.execute(stmt)
    member = res.scalars().first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
        
    await _apply_member_update(member, data, current_gym, db)
    await db.commit()
    return map_member_response(member)

# PATCH /update — matches Next.js exactly (ID in body)
@router.patch("/update", response_model=MemberResponse)
async def update_member_body(
    data: dict, 
    current_gym: Gym = Depends(get_current_gym), 
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),
):
    member_id = data.get("id")
    if not member_id:
        raise HTTPException(status_code=400, detail="Member ID required")
    
    stmt = select(Member).where(Member.id == member_id, Member.gymId == current_gym.id)
    res = await db.execute(stmt)
    member = res.scalars().first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
        
    # Validate raw dict against Pydantic schema to block mass-assignment
    try:
        update_model = MemberUpdate.model_validate(data)
    except Exception: # fallback for pydantic v1
        update_model = MemberUpdate(**data)

    # Use the shared update logic
    await _apply_member_update(member, update_model, current_gym, db)
    await db.commit()
    
    return map_member_response(member)


@router.post("/{member_id}/image")
@rate_limit("10/minute")
async def upload_member_image(
    member_id: str,
    file: UploadFile = File(...),
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),
):
    """Upload profile photo for a member using object storage."""
    from core.storage import upload_image, delete_image, StorageFolder, get_signed_url

    stmt = select(Member).where(Member.id == member_id, Member.gymId == current_gym.id)
    res = await db.execute(stmt)
    member = res.scalars().first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    image_bytes = await file.read()

    # Delete old image if exists
    if getattr(member, 'imageUrl', None):
        delete_image(member.imageUrl)

    storage_key = upload_image(image_bytes, folder=StorageFolder.MEMBERS, mime_type=file.content_type)
    
    member.imageUrl = storage_key
    member.hasImage = True
    member.lastEditedBy = current_gym.username
    member.editReason = "Uploaded Profile Photo"

    log_audit(db, current_gym.id, "Member", member.id, "UPDATE", {"action": "Image Upload"}, current_gym.username)
    await db.commit()

    return {"message": "Image uploaded successfully", "imageUrl": get_signed_url(storage_key)}


@router.get("/{member_id}/image")
async def get_member_image(
    member_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get signed URL for member profile photo."""
    from core.storage import get_signed_url
    from fastapi.responses import RedirectResponse

    stmt = select(Member).where(Member.id == member_id, Member.gymId == current_gym.id)
    res = await db.execute(stmt)
    member = res.scalars().first()
    
    if not member or not getattr(member, 'imageUrl', None):
        raise HTTPException(status_code=404, detail="Image not found")
        
    return RedirectResponse(get_signed_url(member.imageUrl))


@router.delete("/{member_id}/image", status_code=status.HTTP_204_NO_CONTENT)
async def delete_member_image(
    member_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),
):
    """Remove member profile photo."""
    from core.storage import delete_image
    
    stmt = select(Member).where(Member.id == member_id, Member.gymId == current_gym.id)
    res = await db.execute(stmt)
    member = res.scalars().first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    if getattr(member, 'imageUrl', None):
        delete_image(member.imageUrl)

    member.imageUrl = None
    member.hasImage = False
    member.lastEditedBy = current_gym.username
    member.editReason = "Removed Profile Photo"

    log_audit(db, current_gym.id, "Member", member.id, "UPDATE", {"action": "Image Deleted"}, current_gym.username)
    await db.commit()
    
    return None

@router.get("/client/{client_number}", response_model=MemberResponse)
async def get_member_by_client_number(client_number: int, current_gym: Gym = Depends(get_current_gym), db: AsyncSession = Depends(get_async_db)):
    """Get member details by client number (receipt number)"""
    stmt = select(Member).where(
        Member.MembershipReceiptnumber == client_number,
        Member.gymId == current_gym.id
    )
    res = await db.execute(stmt)
    member = res.scalars().first()

    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # FIX: use cache (10-min TTL)
    settings = await get_async_gym_settings(current_gym.id, db)
    admission_expiry_days = settings.admissionExpiryDays if settings and settings.admissionExpiryDays else 365
    return map_member_response(member, admission_expiry_days)


@router.get("/{member_id}", response_model=MemberResponse)
async def get_member_by_id(member_id: str, current_gym: Gym = Depends(get_current_gym), db: AsyncSession = Depends(get_async_db)):
    """Get a single member by their UUID (used by invoice detail view)"""
    stmt = select(Member).where(
        Member.id == member_id,
        Member.gymId == current_gym.id
    )
    res = await db.execute(stmt)
    member = res.scalars().first()

    if not member:
        raise HTTPException(status_code=404, detail="Member not found")

    # FIX: use cache (10-min TTL)
    settings = await get_async_gym_settings(current_gym.id, db)
    admission_expiry_days = settings.admissionExpiryDays if settings and settings.admissionExpiryDays else 365
    return map_member_response(member, admission_expiry_days)

