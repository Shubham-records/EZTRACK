import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy import update, func
from typing import List, Optional

from core.database import get_async_db
from core.dependencies import get_current_gym, require_owner_or_manager
from core.date_utils import parse_date, format_date
from core.storage import upload_image, get_signed_url, delete_image, StorageFolder
from models.all_models import Gym, Expense
from schemas.expense import ExpenseCreate, ExpenseUpdate, ExpenseResponse, BulkExpenseCreate, BulkDeleteRequest
from core.audit_utils import log_audit
from core.rate_limit import rate_limit

logger = logging.getLogger(__name__)
router = APIRouter()


def map_expense_response(expense: Expense):
    e_dict = expense.__dict__.copy()
    e_dict['_id'] = expense.id
    e_dict.pop('_sa_instance_state', None)
    e_dict['hasReceipt'] = bool(getattr(expense, 'receiptUrl', None))
    # Format date as DD/MM/YYYY
    e_dict['date'] = format_date(expense.date)
    return e_dict


@router.get("")
@router.get("/")
async def get_expenses(
    category: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    page: int = 1,
    page_size: int = 30,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
):
    """ARCH-06: Paginated expenses. max page_size=500."""
    page_size = max(1, min(page_size, 500))
    offset = (page - 1) * page_size

    stmt = select(Expense).where(
        Expense.gymId == current_gym.id,
        Expense.isDeleted == False
    )

    if category:
        stmt = stmt.where(Expense.category == category)
    if start_date:
        stmt = stmt.where(Expense.date >= parse_date(start_date))
    if end_date:
        stmt = stmt.where(Expense.date <= parse_date(end_date))

    # Get total count
    count_stmt = select(func.count()).select_from(stmt.subquery())
    count_res = await db.execute(count_stmt)
    total = count_res.scalar()

    # Get paginated data
    stmt = stmt.order_by(Expense.date.desc()).offset(offset).limit(page_size)
    res = await db.execute(stmt)
    expenses = res.scalars().all()
    
    total_pages = (total + page_size - 1) // page_size if page_size > 0 else 1

    return {
        "data": [map_expense_response(e) for e in expenses],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages,
    }


@router.post("", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ExpenseResponse, status_code=status.HTTP_201_CREATED)
@rate_limit("30/minute")
async def create_expense(
    data: ExpenseCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),   # SEC-HIGH-03: MANAGER+ only
):
    """Create a new expense record."""
    expense_data = data.model_dump()
    expense_data['date'] = parse_date(expense_data.get('date'))
    expense = Expense(gymId=current_gym.id, **expense_data)
    db.add(expense)
    await db.flush()
    log_audit(db, current_gym.id, "Expense", expense.id, "CREATE",
              {"category": expense.category, "amount": expense.amount},
              current_gym.username)
    await db.commit()
    # await db.refresh(expense)
    return map_expense_response(expense)


@router.post("/bulk-create")
@rate_limit("5/minute")
async def bulk_create_expenses(
    request: Request,
    data: BulkExpenseCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),   # SEC-HIGH-03: MANAGER+ only
):
    """Bulk create expenses from import.
    SEC-CRIT-02: Uses BulkExpenseCreate typed schema — no raw dict.
    """
    expenses_list = data.all_items()
    created_count = 0
    failed_count = 0
    batch_size = 100

    for i in range(0, len(expenses_list), batch_size):
        batch = expenses_list[i : i + batch_size]
        try:
            async with db.begin_nested():
                for item in batch:
                    new_expense = Expense(
                        gymId=current_gym.id,
                        description=item.description or "Imported Expense",
                        amount=float(item.amount),
                        category=item.category or "Other",
                        paymentMode=item.paymentMode or "Cash",
                        date=parse_date(item.date),
                        notes=item.notes,
                        lastEditedBy=current_gym.username,
                        editReason='Bulk Import',
                    )
                    db.add(new_expense)
                await db.flush()
            created_count += len(batch)
        except Exception as e:
            logger.error("Bulk expense batch %d failed: %s", i // batch_size, type(e).__name__)
            failed_count += len(batch)
            continue

    await db.commit()
    return {"message": f"Created {created_count} expenses, {failed_count} failed", "count": created_count, "failed": failed_count}


@router.post("/bulk-delete")
async def bulk_delete_expenses(
    data: BulkDeleteRequest,   # SW-06: typed, max 500 ids validated by Pydantic
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Bulk delete expenses. SEC-NEW-04: Requires MANAGER+, capped at 500, audit-logged.
    SW-06: Replaced raw dict with BulkDeleteRequest schema — Pydantic validates
    that ids is a non-empty list of strings with at most 500 items.
    """
    ids = data.ids

    try:
        from datetime import datetime, timezone
        stmt = update(Expense).where(
            Expense.id.in_(ids),
            Expense.gymId == current_gym.id
        ).values(isDeleted=True, deletedAt=datetime.now(timezone.utc))
        result = await db.execute(stmt)
        # SEC-NEW-04: Audit log for bulk soft-deletes
        log_audit(db, current_gym.id, "Expense", "bulk", "DELETE",
                  {"ids_count": result.rowcount, "requested_ids": len(ids)},
                  current_gym.username)
        await db.commit()
        return {"message": f"Deleted {result.rowcount} expenses", "count": result.rowcount}
    except Exception as e:
        await db.rollback()
        logger.error("Bulk expense delete error: %s", type(e).__name__, exc_info=True)
        raise HTTPException(status_code=500, detail="Bulk delete failed. Please try again.")


@router.put("/{expense_id}", response_model=ExpenseResponse)
async def update_expense(
    expense_id: str,
    data: ExpenseUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager),   # SEC-HIGH-03: MANAGER+ only
):
    """Update an expense record."""
    stmt = select(Expense).where(
        Expense.id == expense_id,
        Expense.gymId == current_gym.id,
        Expense.isDeleted == False
    )
    res = await db.execute(stmt)
    expense = res.scalars().first()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    update_data = data.model_dump(exclude_unset=True)
    if 'date' in update_data:
        update_data['date'] = parse_date(update_data['date'])
    for key, value in update_data.items():
        setattr(expense, key, value)
    
    log_audit(db, current_gym.id, "Expense", expense.id, "UPDATE",
              update_data, current_gym.username)
    await db.commit()
    # await db.refresh(expense)
    return map_expense_response(expense)


@router.delete("/{expense_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_expense(
    expense_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Delete an expense record."""
    stmt = select(Expense).where(
        Expense.id == expense_id,
        Expense.gymId == current_gym.id,
        Expense.isDeleted == False
    )
    res = await db.execute(stmt)
    expense = res.scalars().first()
    
    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")
    
    log_audit(db, current_gym.id, "Expense", expense.id, "DELETE",
              {"category": expense.category, "amount": expense.amount},
              current_gym.username)
    from datetime import datetime, timezone
    expense.isDeleted = True
    expense.deletedAt = datetime.now(timezone.utc)
    await db.commit()
    return None


@router.post("/{expense_id}/receipt")
@rate_limit("10/minute")
async def upload_receipt(
    expense_id: str,
    file: UploadFile = File(...),
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)  # SEC-VULN-09: restrict receipt uploads
):
    """Upload receipt image for an expense — stored in object storage (not DB)."""
    stmt = select(Expense).where(
        Expense.id == expense_id,
        Expense.gymId == current_gym.id,
        Expense.isDeleted == False
    )
    res = await db.execute(stmt)
    expense = res.scalars().first()

    if not expense:
        raise HTTPException(status_code=404, detail="Expense not found")

    # Delete old receipt from storage if one exists
    if expense.receiptUrl:
        delete_image(expense.receiptUrl)

    image_data = await file.read()
    # FIX: store in object storage, keep only the key in DB
    storage_key = upload_image(
        image_data,
        folder=StorageFolder.RECEIPTS,
        mime_type=file.content_type,
    )

    expense.receiptUrl      = storage_key
    expense.receiptMimeType = file.content_type
    expense.hasReceipt      = True
    await db.commit()

    return {
        "message":    "Receipt uploaded successfully",
        "receiptUrl": get_signed_url(storage_key),
    }


@router.get("/{expense_id}/receipt")
async def get_receipt(
    expense_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """
    Get a fresh signed URL for an expense receipt.
    Returns a redirect to the signed URL so the browser fetches the image
    directly from object storage — no binary data passes through the API.
    """
    stmt = select(Expense).where(
        Expense.id == expense_id,
        Expense.gymId == current_gym.id,
        Expense.isDeleted == False
    )
    res = await db.execute(stmt)
    expense = res.scalars().first()

    if not expense or not expense.receiptUrl:
        raise HTTPException(status_code=404, detail="Receipt not found")

    # FIX: generate a short-lived signed URL and redirect the client to it
    signed_url = get_signed_url(expense.receiptUrl)
    return RedirectResponse(url=signed_url, status_code=302)


from core.cache import LRUTTLCache

_expense_summary_cache = LRUTTLCache(maxsize=500, ttl=300) # 5m TTL

@router.get("/summary")
async def get_expense_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get expense summary by category.
    BUG-02 fix: parse date strings before comparing with Date column.
    BUG-03 fix: use SQL GROUP BY instead of Python in-memory grouping.
    PB-09 fix: Cache full-table aggregations.
    """
    cache_key = f"{current_gym.id}:{start_date}:{end_date}"
    cached_entry = _expense_summary_cache.get(cache_key)
    if cached_entry:
        return cached_entry["data"]

    from sqlalchemy import func

    stmt = select(
        Expense.category,
        func.sum(Expense.amount).label("category_total"),
        func.count(Expense.id).label("category_count"),
    ).where(
        Expense.gymId == current_gym.id,
        Expense.isDeleted == False,
    )

    # BUG-02: parse strings to native date before comparing with Date column
    if start_date:
        parsed_start = parse_date(start_date)
        if parsed_start:
            stmt = stmt.where(Expense.date >= parsed_start)
    if end_date:
        parsed_end = parse_date(end_date)
        if parsed_end:
            stmt = stmt.where(Expense.date <= parsed_end)

    stmt = stmt.group_by(Expense.category)
    res = await db.execute(stmt)
    rows = res.all()

    summary = {r.category: round(float(r.category_total or 0), 2) for r in rows}
    total   = round(sum(summary.values()), 2)
    count   = sum(r.category_count for r in rows)

    response_data = {
        "summary": summary,
        "totalAmount": total,
        "totalExpenses": count,
    }
    
    from datetime import datetime
    _expense_summary_cache.set(cache_key, {"data": response_data, "ts": datetime.now()})
    return response_data


# Expense categories constant
EXPENSE_CATEGORIES = [
    "Rent",
    "Electricity",
    "Salaries",
    "Maintenance",
    "Supplies",
    "Marketing",
    "Equipment",
    "Insurance",
    "Utilities",
    "Other"
]


@router.get("/categories")
async def get_expense_categories():
    """Get list of expense categories."""
    return EXPENSE_CATEGORIES
