import logging
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import Response, RedirectResponse
from sqlalchemy.orm import Session
from typing import List, Optional

from core.database import get_db
from core.dependencies import get_current_gym, require_owner_or_manager
from core.date_utils import parse_date, format_date
from models.all_models import Gym, ProteinStock, GymSettings, ProteinLot
from schemas.protein import ProteinCreate, ProteinUpdate, ProteinInlineUpdate, BulkProteinCreate, ProteinResponse, BulkDeleteRequest, ProteinLotCreate, ProteinLotUpdate
from sqlalchemy.sql import func
from core.audit_utils import log_audit, compute_diff
from core.storage import upload_image, get_signed_url, delete_image, StorageFolder, get_signed_url_or_none

logger = logging.getLogger(__name__)
router = APIRouter()


def calculate_selling_price(landing_price, margin: float, offer: float) -> float:
    """Calculate selling price: Landing + Margin - Offer"""
    try:
        landing = float(landing_price) if landing_price else 0
        return landing + (margin or 0) - (offer or 0)
    except (ValueError, TypeError):
        return 0


def calculate_profit_amount(selling_price, landing_price) -> float:
    """Calculate profit amount per pcs: Selling - Landing"""
    try:
        selling = float(selling_price) if selling_price else 0
        landing = float(landing_price) if landing_price else 0
        return round(selling - landing, 2)
    except (ValueError, TypeError):
        return 0


def recalculate_computed_fields(protein):
    """Always recalculate ProfitAmount after any edit. TotalPrice is computed in response."""
    try:
        landing = protein.LandingPrice or 0
        selling = float(protein.SellingPrice) if protein.SellingPrice else 0
        protein.ProfitAmount = round(selling - landing, 2)
    except (ValueError, TypeError):
        pass



def map_protein_response(p: ProteinStock, low_stock_threshold: int = 5):
    p_dict = p.__dict__.copy()
    p_dict['_id'] = p.id
    p_dict.pop('_sa_instance_state', None)
    p_dict.pop('imageData', None)  # Don't send binary in list (deferred, but safety net)
    p_dict.pop('imageMimeType', None)
    p_dict['hasImage'] = getattr(p, 'hasImage', False) or False
    
    # Always recompute TotalPrice and ProfitAmount dynamically
    qty = p.Quantity or 0
    landing = p.LandingPrice or 0
    selling = float(p.SellingPrice) if p.SellingPrice else 0
    p_dict['TotalPrice'] = round(qty * landing, 2)
    p_dict['ProfitAmount'] = round(selling - landing, 2)
    
    # Calculate low stock indicator
    threshold = p.StockThreshold or low_stock_threshold
    p_dict['isLowStock'] = qty < threshold
    # Format ExpiryDate for JSON response
    p_dict['ExpiryDate'] = format_date(p.ExpiryDate)
    # Attach lots summary
    try:
        p_dict['lots'] = []
        for lot in getattr(p, 'lots', []) or []:
            lot_obj = {
                'id': lot.id,
                'lotNumber': lot.lotNumber,
                'quantity': lot.quantity,
                'purchasePrice': lot.purchasePrice,
                'sellingPrice': lot.sellingPrice,
                'expiryDate': format_date(lot.expiryDate),
            }
            p_dict['lots'].append(lot_obj)
    except Exception:
        p_dict['lots'] = []
    
    return p_dict


@router.get("")
@router.get("/")
def get_proteins(
    page: int = 1,
    page_size: int = 30,
    search: str = "",
    brand: Optional[str] = None,
    low_stock_only: Optional[bool] = False,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get proteins with server-side pagination."""
    # Get gym settings for default threshold
    settings = db.query(GymSettings).filter(GymSettings.gymId == current_gym.id).first()
    default_threshold = settings.lowStockThreshold if settings else 5
    
    query = db.query(ProteinStock).filter(
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False
    )
    
    if brand:
        query = query.filter(ProteinStock.Brand == brand)
    
    if search:
        search_term = f"%{search}%"
        from sqlalchemy import or_
        query = query.filter(
            or_(
                ProteinStock.ProductName.ilike(search_term),
                ProteinStock.Brand.ilike(search_term),
                ProteinStock.Flavour.ilike(search_term),
            )
        )
    
    if low_stock_only:
        query = query.filter(ProteinStock.Quantity < ProteinStock.StockThreshold)
    
    total = query.count()
    
    if page_size > 0:
        offset = (page - 1) * page_size
        proteins = query.order_by(ProteinStock.createdAt.desc()).offset(offset).limit(page_size).all()
        total_pages = (total + page_size - 1) // page_size
    else:
        proteins = query.order_by(ProteinStock.createdAt.desc()).all()
        total_pages = 1
        page_size = total
    
    return {
        "data": [map_protein_response(p, default_threshold) for p in proteins],
        "total": total,
        "page": page,
        "pageSize": page_size,
        "totalPages": total_pages
    }


@router.get("/brands")
def get_protein_brands(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get list of unique brands."""
    proteins = db.query(ProteinStock.Brand).filter(
        ProteinStock.gymId == current_gym.id,
        ProteinStock.Brand != None
    ).distinct().all()
    return [p[0] for p in proteins if p[0]]


@router.get("/low-stock")
def get_low_stock_proteins(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get proteins below stock threshold."""
    settings = db.query(GymSettings).filter(GymSettings.gymId == current_gym.id).first()
    default_threshold = settings.lowStockThreshold if settings else 5
    
    from sqlalchemy import func
    
    # SEC-PERF: Filter directly in DB using coalesce
    proteins = db.query(ProteinStock).filter(
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False,
        ProteinStock.Quantity < func.coalesce(ProteinStock.StockThreshold, default_threshold)
    ).all()
    
    low_stock = [map_protein_response(p, default_threshold) for p in proteins]
    
    return {
        "count": len(low_stock),
        "items": low_stock
    }


@router.get("/summary")
def get_protein_summary(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get protein stock summary statistics.

    SW-13 / PB-06: Replaced Python-loop aggregation with SQL aggregates.
    Previously loaded ALL protein rows into memory — O(n) CPU + memory.
    Now runs a single SQL GROUP aggregate — O(1) from application perspective.
    """
    settings = db.query(GymSettings).filter(GymSettings.gymId == current_gym.id).first()
    default_threshold = settings.lowStockThreshold if settings else 5

    # Single SQL aggregate — no Python iteration over rows
    from sqlalchemy import case
    agg = db.query(
        func.count().label("total_items"),
        func.coalesce(func.sum(ProteinStock.Quantity), 0).label("total_quantity"),
        func.coalesce(
            func.sum(ProteinStock.Quantity * ProteinStock.LandingPrice), 0
        ).label("total_stock_value"),
        func.coalesce(
            func.sum(ProteinStock.Quantity * ProteinStock.SellingPrice), 0
        ).label("total_potential_revenue"),
        # Count items where Quantity < COALESCE(StockThreshold, default_threshold)
        func.sum(
            case(
                (ProteinStock.Quantity < func.coalesce(ProteinStock.StockThreshold, default_threshold), 1),
                else_=0
            )
        ).label("low_stock_count"),
    ).filter(
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False,
    ).one()

    # Unique brands — separate lightweight query (COUNT DISTINCT)
    unique_brands = db.query(
        func.count(func.distinct(ProteinStock.Brand))
    ).filter(
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False,
        ProteinStock.Brand.isnot(None),
        ProteinStock.Brand != "",
    ).scalar() or 0

    total_stock  = float(agg.total_stock_value or 0)
    total_rev    = float(agg.total_potential_revenue or 0)

    return {
        "totalItems":           int(agg.total_items or 0),
        "totalQuantity":        int(agg.total_quantity or 0),
        "totalStockValue":      round(total_stock, 2),
        "totalPotentialRevenue": round(total_rev, 2),
        "potentialProfit":      round(total_rev - total_stock, 2),
        "lowStockCount":        int(agg.low_stock_count or 0),
        "uniqueBrands":         int(unique_brands),
    }


@router.get("/{protein_id}", response_model=ProteinResponse)
def get_protein(
    protein_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get single protein by ID."""
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False
    ).first()
    
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")
    
    return map_protein_response(protein)


@router.post("", response_model=ProteinResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=ProteinResponse, status_code=status.HTTP_201_CREATED)
def create_protein(
    data: ProteinCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Create a new protein stock entry."""
    protein_data = data.model_dump()
    
    # Auto-calculate selling price if not provided
    if protein_data.get('LandingPrice') and not protein_data.get('SellingPrice'):
        protein_data['SellingPrice'] = calculate_selling_price(
            protein_data.get('LandingPrice'),
            protein_data.get('MarginPrice', 0),
            protein_data.get('OfferPrice', 0)
        )
    
    # Auto-calculate profit amount
    selling = protein_data.get('SellingPrice')
    landing = protein_data.get('LandingPrice')
    if selling and landing:
        protein_data['ProfitAmount'] = calculate_profit_amount(selling, landing)
    # Parse ExpiryDate string to native Date
    if protein_data.get('ExpiryDate'):
        protein_data['ExpiryDate'] = parse_date(protein_data['ExpiryDate'])
    
    protein = ProteinStock(gymId=current_gym.id, **protein_data)
    db.add(protein)
    db.commit()
    db.refresh(protein)

    return map_protein_response(protein)


@router.post("/bulk-create")
def bulk_create_proteins(
    data: BulkProteinCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Bulk create protein stocks from import.
    SEC-CRIT-02: Uses BulkProteinCreate typed schema — no raw dict.
    """
    created_count = 0

    for stock_data in data.stocks:
        try:
            landing = float(stock_data.LandingPrice or 0)
            margin  = float(stock_data.MarginPrice or 0)
            offer   = float(stock_data.OfferPrice or 0)

            if stock_data.SellingPrice is not None:
                selling = float(stock_data.SellingPrice)
            elif margin or offer:
                selling = landing + margin - offer
            else:
                selling = 0

            protein = ProteinStock(
                gymId=current_gym.id,
                Brand=stock_data.Brand,
                ProductName=stock_data.ProductName,
                Flavour=stock_data.Flavour,
                Weight=str(stock_data.Weight or ""),
                Quantity=int(stock_data.Quantity or 0),
                MRPPrice=float(stock_data.MRPPrice or 0),
                LandingPrice=landing,
                Remark=stock_data.Remark,
                MarginPrice=margin,
                OfferPrice=offer,
                SellingPrice=selling,
                ExpiryDate=parse_date(stock_data.ExpiryDate),
                StockThreshold=int(stock_data.StockThreshold or 5),
            )

            recalculate_computed_fields(protein)
            db.add(protein)
            created_count += 1
        except Exception as e:
            logger.error("Bulk protein create error: %s", type(e).__name__, exc_info=False)
            continue

    db.commit()
    return {"message": f"Created {created_count} proteins", "count": created_count}


@router.post("/bulk-delete")
def bulk_delete_proteins(
    data: BulkDeleteRequest,   # SW-06: typed, max 500 ids enforced by Pydantic
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """SW-06: Replaced raw dict with BulkDeleteRequest schema.
    Pydantic validates ids is a non-empty list of strings with at most 500 items.
    """
    ids = data.ids

    try:
        from datetime import datetime, timezone
        stmt = ProteinStock.__table__.update().where(
            ProteinStock.id.in_(ids),
            ProteinStock.gymId == current_gym.id
        ).values(isDeleted=True, deletedAt=datetime.now(timezone.utc))
        result = db.execute(stmt)
        # SEC-NEW-04: Audit log for bulk soft-deletes
        log_audit(db, current_gym.id, "ProteinStock", "bulk", "DELETE",
                  {"ids_count": result.rowcount, "requested_ids": len(ids)},
                  current_gym.username)
        db.commit()
        return {"message": f"Deleted {result.rowcount} proteins", "count": result.rowcount}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{protein_id}", response_model=ProteinResponse)

def update_protein(
    protein_id: str,
    data: ProteinUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Update a protein stock entry."""
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False
    ).first()
    
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")
    
    update_data = data.model_dump(exclude_unset=True)
    
    # Capture old prices before mutation for audit diff
    old_prices = {k: getattr(protein, k, None) for k in ['SellingPrice', 'LandingPrice', 'MarginPrice', 'OfferPrice', 'MRPPrice']}
    
    # Parse ExpiryDate string → native Date
    if 'ExpiryDate' in update_data:
        update_data['ExpiryDate'] = parse_date(update_data['ExpiryDate'])
    
    for key, value in update_data.items():
        setattr(protein, key, value)
    
    # Only recalculate selling price if margin/offer pricing fields changed
    # AND the user did NOT explicitly set SellingPrice in this request
    if any(k in update_data for k in ['LandingPrice', 'MarginPrice', 'OfferPrice']) and 'SellingPrice' not in update_data:
        protein.SellingPrice = calculate_selling_price(
            protein.LandingPrice,
            protein.MarginPrice,
            protein.OfferPrice
        )
    
    # Recalculate computed fields only if relevant fields changed
    if any(k in update_data for k in ['Quantity', 'LandingPrice', 'SellingPrice', 'MarginPrice', 'OfferPrice']):
        recalculate_computed_fields(protein)
    
    # Audit log for price changes (powers price history endpoint)
    price_fields = ['SellingPrice', 'LandingPrice', 'MarginPrice', 'OfferPrice', 'MRPPrice']
    price_diff = {}
    for k in price_fields:
        if k in update_data and update_data[k] != old_prices.get(k):
            price_diff[k] = {"from": old_prices.get(k), "to": update_data[k]}
    if price_diff:
        log_audit(db, current_gym.id, "ProteinStock", protein_id, "UPDATE",
                  price_diff, current_gym.username)
    
    db.commit()
    db.refresh(protein)
    
    return map_protein_response(protein)


@router.patch("/update")
def update_protein_body(
    data: ProteinInlineUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Update protein with ID in body (for table inline edit compatibility).
    SEC-CRIT-01: Now uses ProteinInlineUpdate typed schema — no raw dict.
    """
    protein_id = data.id
    if not protein_id:
        raise HTTPException(status_code=400, detail="Protein ID required")

    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False
    ).first()

    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")

    # Capture old prices before mutation for audit diff
    old_prices = {k: getattr(protein, k, None) for k in ['SellingPrice', 'LandingPrice', 'MarginPrice', 'OfferPrice', 'MRPPrice']}

    updatable_data = data.model_dump(exclude_unset=True, exclude={"id"})

    for key, value in updatable_data.items():
        if hasattr(protein, key):
            if key == 'ExpiryDate':
                value = parse_date(value)
            setattr(protein, key, value)

    # Only recalculate selling price if margin/offer pricing fields changed
    # AND the user did NOT explicitly set SellingPrice in this request
    if any(k in updatable_data for k in ['LandingPrice', 'MarginPrice', 'OfferPrice']) and 'SellingPrice' not in updatable_data:
        protein.SellingPrice = calculate_selling_price(
            protein.LandingPrice,
            protein.MarginPrice,
            protein.OfferPrice
        )

    # Recalculate computed fields only if relevant fields changed
    if any(k in updatable_data for k in ['Quantity', 'LandingPrice', 'SellingPrice', 'MarginPrice', 'OfferPrice']):
        recalculate_computed_fields(protein)

    # Audit log for price changes
    price_fields = ['SellingPrice', 'LandingPrice', 'MarginPrice', 'OfferPrice', 'MRPPrice']
    price_diff = {}
    for k in price_fields:
        if k in updatable_data and updatable_data[k] != old_prices.get(k):
            price_diff[k] = {"from": old_prices.get(k), "to": updatable_data[k]}
    if price_diff:
        log_audit(db, current_gym.id, "ProteinStock", protein_id, "UPDATE",
                  price_diff, current_gym.username)

    db.commit()
    db.refresh(protein)

    return map_protein_response(protein)


@router.delete("/{protein_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_protein(
    protein_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Delete a protein stock entry."""
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False
    ).first()
    
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")
    
    from datetime import datetime, timezone
    protein.isDeleted = True
    protein.deletedAt = datetime.now(timezone.utc)
    
    # Audit log
    log_audit(db, current_gym.id, "ProteinStock", protein_id, "DELETE", None, current_gym.username)
    db.commit()
    return None


# ============ IMAGE ENDPOINTS ============

@router.post("/{protein_id}/image")
async def upload_protein_image(
    protein_id: str,
    file: UploadFile = File(...),
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Upload image for a protein product.
    SEC-HIGH-04 & SEC-HIGH-05: Uses object storage with size + magic byte validation.
    """
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False
    ).first()
    
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")
    
    image_data = await file.read()
    
    if getattr(protein, 'imageUrl', None):
        delete_image(protein.imageUrl)
        
    storage_key = upload_image(image_data, folder=StorageFolder.PROTEINS, mime_type=file.content_type)
    
    protein.imageUrl = storage_key
    protein.imageMimeType = file.content_type
    protein.hasImage = True
    
    db.commit()
    return {"message": "Image uploaded successfully", "imageUrl": get_signed_url(storage_key)}


@router.get("/{protein_id}/image")
def get_protein_image(
    protein_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get signed URL for a protein product image, then redirect to it."""
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False
    ).first()
    
    if not protein or not getattr(protein, 'imageUrl', None):
        raise HTTPException(status_code=404, detail="Image not found")
    
    signed_url = get_signed_url(protein.imageUrl)
    return RedirectResponse(url=signed_url)


@router.delete("/{protein_id}/image", status_code=status.HTTP_204_NO_CONTENT)
def delete_protein_image(
    protein_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Delete image for a protein product."""
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id,
        ProteinStock.isDeleted == False
    ).first()
    
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")
    
    if getattr(protein, 'imageUrl', None):
        delete_image(protein.imageUrl)
    
    protein.imageUrl = None
    protein.imageMimeType = None
    protein.hasImage = False
    
    db.commit()
    return None


# ============ STOCK ADJUSTMENT ============

@router.post("/{protein_id}/adjust-stock")
def adjust_protein_stock(
    protein_id: str,
    adjustment: int,
    reason: Optional[str] = None,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Adjust protein stock quantity by creating an adjustment lot."""
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id
    ).first()
    
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")

    # SCH-NORM-03: Explicit cross-tenant guard before inserting ProteinLot.
    # Same invariant as create_protein_lot — documents that lot.gymId must
    # always equal the parent stock's gymId.
    if protein.gymId != current_gym.id:
        raise HTTPException(
            status_code=403,
            detail="Protein does not belong to this gym",
        )

    current_qty = protein.Quantity or 0
    new_qty = current_qty + adjustment
    
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Stock cannot be negative")
    
    # Create an adjustment lot
    lot = ProteinLot(
        gymId=current_gym.id,
        proteinId=protein.id,
        lotNumber=f"ADJ-{reason or 'Manual'}",
        quantity=adjustment,
        purchasePrice=protein.LandingPrice,
        sellingPrice=protein.SellingPrice,
        expiryDate=protein.ExpiryDate
    )
    db.add(lot)
    
    # Audit log
    log_audit(db, current_gym.id, "ProteinStock", protein_id, "ADJUST_STOCK",
              {"adjustment": adjustment, "new_qty": new_qty, "reason": reason},
              current_gym.username)
              
    db.commit()
    
    db.refresh(protein)

    return {
        "message": f"Stock adjusted by {adjustment}",
        "previousQuantity": current_qty,
        "newQuantity": protein.Quantity,
        "reason": reason
    }


@router.get("/{protein_id}/lots")
def get_protein_lots(
    protein_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id
    ).first()
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")

    lots = db.query(ProteinLot).filter(ProteinLot.proteinId == protein_id, ProteinLot.gymId == current_gym.id).all()
    return [{
        'id': l.id,
        'lotNumber': l.lotNumber,
        'quantity': l.quantity,
        'purchasePrice': l.purchasePrice,
        'sellingPrice': l.sellingPrice,
        'expiryDate': format_date(l.expiryDate),
        'purchaseDate': format_date(l.purchaseDate),
    } for l in lots]


@router.post("/{protein_id}/lots")
def create_protein_lot(
    protein_id: str,
    data: ProteinLotCreate,   # SW-07: typed schema replaces raw dict
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    protein = db.query(ProteinStock).filter(ProteinStock.id == protein_id, ProteinStock.gymId == current_gym.id).first()
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")

    # SCH-NORM-03: Explicit cross-tenant guard
    if protein.gymId != current_gym.id:
        raise HTTPException(status_code=403, detail="Protein does not belong to this gym")

    lot = ProteinLot(
        gymId=current_gym.id,
        proteinId=protein_id,
        quantity=data.quantity,
        expiryDate=parse_date(data.expiryDate),
        purchaseDate=parse_date(data.purchaseDate),
    )
    # Apply optional fields only if present
    if data.notes is not None:
        lot.notes = data.notes
    if data.batchNumber is not None:
        lot.lotNumber = data.batchNumber

    db.add(lot)
    db.commit()
    db.refresh(lot)
    db.refresh(protein)

    return {
        'id': lot.id,
        'lotNumber': lot.lotNumber,
        'quantity': lot.quantity,
        'purchasePrice': lot.purchasePrice,
        'sellingPrice': lot.sellingPrice,
        'expiryDate': format_date(lot.expiryDate),
        'purchaseDate': format_date(lot.purchaseDate),
    }


@router.put("/lots/{lot_id}")
def update_protein_lot(
    lot_id: str,
    data: ProteinLotUpdate,   # SW-07: typed schema replaces raw dict
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    lot = db.query(ProteinLot).filter(ProteinLot.id == lot_id, ProteinLot.gymId == current_gym.id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    protein = db.query(ProteinStock).filter(ProteinStock.id == lot.proteinId, ProteinStock.gymId == current_gym.id).first()

    update_data = data.model_dump(exclude_unset=True)

    if 'quantity' in update_data and update_data['quantity'] is not None:
        lot.quantity = update_data['quantity']
    if 'expiryDate' in update_data:
        lot.expiryDate = parse_date(update_data['expiryDate'])
    if 'purchaseDate' in update_data:
        lot.purchaseDate = parse_date(update_data['purchaseDate'])
    if 'notes' in update_data:
        lot.notes = update_data['notes']
    if 'batchNumber' in update_data:
        lot.lotNumber = update_data['batchNumber']

    db.commit()
    db.refresh(lot)
    if protein:
        db.refresh(protein)
    db.refresh(lot)

    return {
        'id': lot.id,
        'lotNumber': lot.lotNumber,
        'quantity': lot.quantity,
        'purchasePrice': lot.purchasePrice,
        'sellingPrice': lot.sellingPrice,
        'expiryDate': format_date(lot.expiryDate),
        'purchaseDate': format_date(lot.purchaseDate),
    }


@router.delete("/lots/{lot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_protein_lot(
    lot_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    lot = db.query(ProteinLot).filter(ProteinLot.id == lot_id, ProteinLot.gymId == current_gym.id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    protein = db.query(ProteinStock).filter(ProteinStock.id == lot.proteinId, ProteinStock.gymId == current_gym.id).first()
    db.delete(lot)
    db.commit()
    
    return None
