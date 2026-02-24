from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.responses import Response
from sqlalchemy.orm import Session
from typing import List, Optional

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, ProteinStock, GymSettings, ProteinLot
from schemas.protein import ProteinCreate, ProteinUpdate, ProteinResponse

router = APIRouter()


def calculate_selling_price(landing_price: str, margin: float, offer: float) -> float:
    """Calculate selling price: Landing + Margin - Offer"""
    try:
        landing = float(landing_price) if landing_price else 0
        return landing + (margin or 0) - (offer or 0)
    except (ValueError, TypeError):
        return 0


def calculate_profit_amount(selling_price, landing_price: str) -> float:
    """Calculate profit amount per pcs: Selling - Landing"""
    try:
        selling = float(selling_price) if selling_price else 0
        landing = float(landing_price) if landing_price else 0
        return round(selling - landing, 2)
    except (ValueError, TypeError):
        return 0


def recalculate_computed_fields(protein):
    """Always recalculate TotalPrice, ProfitAmount after any edit."""
    try:
        qty = float(protein.Quantity) if protein.Quantity else 0
        landing = float(protein.LandingPrice) if protein.LandingPrice else 0
        selling = float(protein.SellingPrice) if protein.SellingPrice else 0
        protein.TotalPrice = str(round(qty * landing, 2))
        protein.ProfitAmount = round(selling - landing, 2)
    except (ValueError, TypeError):
        pass


def map_protein_response(p: ProteinStock, low_stock_threshold: int = 5):
    p_dict = p.__dict__.copy()
    p_dict['_id'] = p.id
    p_dict.pop('_sa_instance_state', None)
    p_dict.pop('imageData', None)  # Don't send binary in list
    
    # Always recompute TotalPrice and ProfitAmount dynamically
    try:
        qty = float(p.Quantity) if p.Quantity else 0
        landing = float(p.LandingPrice) if p.LandingPrice else 0
        selling = float(p.SellingPrice) if p.SellingPrice else 0
        p_dict['TotalPrice'] = str(round(qty * landing, 2))
        p_dict['ProfitAmount'] = round(selling - landing, 2)
    except (ValueError, TypeError):
        pass
    
    # Calculate low stock indicator
    try:
        qty = int(p.Quantity) if p.Quantity else 0
        threshold = p.StockThreshold or low_stock_threshold
        p_dict['isLowStock'] = qty < threshold
    except (ValueError, TypeError):
        p_dict['isLowStock'] = False
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
                'expiryDate': lot.expiryDate,
            }
            p_dict['lots'].append(lot_obj)
    except Exception:
        p_dict['lots'] = []
    
    return p_dict


@router.get("", response_model=List[ProteinResponse])
@router.get("/", response_model=List[ProteinResponse])
def get_proteins(
    brand: Optional[str] = None,
    low_stock_only: Optional[bool] = False,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get all proteins with optional filters."""
    # Get gym settings for default threshold
    settings = db.query(GymSettings).filter(GymSettings.gymId == current_gym.id).first()
    default_threshold = settings.lowStockThreshold if settings else 5
    
    query = db.query(ProteinStock).filter(ProteinStock.gymId == current_gym.id)
    
    if brand:
        query = query.filter(ProteinStock.Brand == brand)
    
    proteins = query.all()
    result = [map_protein_response(p, default_threshold) for p in proteins]
    
    # Filter low stock if requested
    if low_stock_only:
        result = [p for p in result if p.get('isLowStock', False)]
    
    return result


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
    
    proteins = db.query(ProteinStock).filter(ProteinStock.gymId == current_gym.id).all()
    
    low_stock = []
    for p in proteins:
        try:
            qty = int(p.Quantity) if p.Quantity else 0
            threshold = p.StockThreshold or default_threshold
            if qty < threshold:
                low_stock.append(map_protein_response(p, default_threshold))
        except (ValueError, TypeError):
            pass
    
    return {
        "count": len(low_stock),
        "items": low_stock
    }


@router.get("/summary")
def get_protein_summary(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get protein stock summary statistics."""
    proteins = db.query(ProteinStock).filter(ProteinStock.gymId == current_gym.id).all()
    settings = db.query(GymSettings).filter(GymSettings.gymId == current_gym.id).first()
    default_threshold = settings.lowStockThreshold if settings else 5
    
    total_items = len(proteins)
    total_quantity = 0
    total_stock_value = 0
    total_potential_revenue = 0
    low_stock_count = 0
    brands = set()
    
    for p in proteins:
        try:
            qty = int(p.Quantity) if p.Quantity else 0
            landing = float(p.LandingPrice) if p.LandingPrice else 0
            selling = p.SellingPrice or 0
            threshold = p.StockThreshold or default_threshold
            
            total_quantity += qty
            total_stock_value += qty * landing
            total_potential_revenue += qty * selling
            
            if qty < threshold:
                low_stock_count += 1
            
            if p.Brand:
                brands.add(p.Brand)
        except (ValueError, TypeError):
            pass
    
    return {
        "totalItems": total_items,
        "totalQuantity": total_quantity,
        "totalStockValue": round(total_stock_value, 2),
        "totalPotentialRevenue": round(total_potential_revenue, 2),
        "potentialProfit": round(total_potential_revenue - total_stock_value, 2),
        "lowStockCount": low_stock_count,
        "uniqueBrands": len(brands)
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
        ProteinStock.gymId == current_gym.id
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
    
    protein = ProteinStock(gymId=current_gym.id, **protein_data)
    db.add(protein)
    db.commit()
    db.refresh(protein)

    return map_protein_response(protein)


@router.post("/bulk-create")
def bulk_create_proteins(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Bulk create protein stocks from import"""
    stocks_list = data.get("stocks", [])
    created_count = 0
    
    for stock_data in stocks_list:
        try:
            landing = float(stock_data.get("LandingPrice", 0)) if stock_data.get("LandingPrice") else 0
            margin = float(stock_data.get("MarginPrice", 0)) if stock_data.get("MarginPrice") else 0
            offer = float(stock_data.get("OfferPrice", 0)) if stock_data.get("OfferPrice") else 0
            
            # Use explicit SellingPrice from import if provided, otherwise calculate
            if stock_data.get("SellingPrice"):
                selling = float(stock_data["SellingPrice"])
            elif margin or offer:
                selling = landing + margin - offer
            else:
                selling = 0
            
            protein = ProteinStock(
                gymId=current_gym.id,
                Year=str(stock_data.get("Year", "")),
                Month=str(stock_data.get("Month", "")),
                Brand=stock_data.get("Brand"),
                ProductName=stock_data.get("ProductName"),
                Flavour=stock_data.get("Flavour"),
                Weight=str(stock_data.get("Weight", "")),
                Quantity=str(stock_data.get("Quantity", "0")),
                MRPPrice=str(stock_data.get("MRPPrice", "")),
                LandingPrice=str(stock_data.get("LandingPrice", "")),
                TotalPrice=str(stock_data.get("TotalPrice", "")),
                Remark=stock_data.get("Remark"),
                MarginPrice=margin,
                OfferPrice=offer,
                SellingPrice=selling,
                ExpiryDate=stock_data.get("ExpiryDate"),
                AvailableStock=int(stock_data.get("AvailableStock", stock_data.get("Quantity", 0))) if stock_data.get("AvailableStock") or stock_data.get("Quantity") else 0,
                StockThreshold=int(stock_data.get("StockThreshold", 5)) if stock_data.get("StockThreshold") else 5
            )
            
            # Recalculate computed fields
            recalculate_computed_fields(protein)
            
            db.add(protein)
            created_count += 1
        except Exception as e:
            print(f"Error creating protein: {e}")
            continue
    
    db.commit()
    return {"message": f"Created {created_count} proteins", "count": created_count}


@router.post("/bulk-delete")
def bulk_delete_proteins(data: dict, current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Bulk delete proteins"""
    ids = data.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No IDs provided")
    
    try:
        stmt = ProteinStock.__table__.delete().where(
            ProteinStock.id.in_(ids),
            ProteinStock.gymId == current_gym.id
        )
        result = db.execute(stmt)
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
        ProteinStock.gymId == current_gym.id
    ).first()
    
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")
    
    update_data = data.model_dump(exclude_unset=True)
    
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
    
    db.commit()
    db.refresh(protein)
    
    return map_protein_response(protein)


@router.patch("/update")
def update_protein_body(
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Update protein with ID in body (for table inline edit compatibility)."""
    protein_id = data.get("id") or data.get("_id")
    if not protein_id:
        raise HTTPException(status_code=400, detail="Protein ID required")
    
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id
    ).first()
    
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")
    
    # Remove metadata and computed fields that should not be overwritten directly
    updatable_data = data.copy()
    for key in ['id', '_id', 'gymId', 'createdAt', 'updatedAt', 'isLowStock', 'lots', 'TotalPrice', 'ProfitAmount']:
        updatable_data.pop(key, None)
    
    for key, value in updatable_data.items():
        if hasattr(protein, key):
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
    
    db.commit()
    db.refresh(protein)
    
    return map_protein_response(protein)


@router.delete("/{protein_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_protein(
    protein_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Delete a protein stock entry."""
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id
    ).first()
    
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")
    
    db.delete(protein)
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
    """Upload image for a protein product."""
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id
    ).first()
    
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")
    
    image_data = await file.read()
    protein.imageData = image_data
    protein.imageMimeType = file.content_type
    
    db.commit()
    return {"message": "Image uploaded successfully"}


@router.get("/{protein_id}/image")
def get_protein_image(
    protein_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get image for a protein product."""
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id
    ).first()
    
    if not protein or not protein.imageData:
        raise HTTPException(status_code=404, detail="Image not found")
    
    return Response(
        content=protein.imageData,
        media_type=protein.imageMimeType or "image/jpeg"
    )


@router.delete("/{protein_id}/image", status_code=status.HTTP_204_NO_CONTENT)
def delete_protein_image(
    protein_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Delete image for a protein product."""
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id
    ).first()
    
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")
    
    protein.imageData = None
    protein.imageMimeType = None
    
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
    """Adjust protein stock quantity (positive to add, negative to subtract)."""
    protein = db.query(ProteinStock).filter(
        ProteinStock.id == protein_id,
        ProteinStock.gymId == current_gym.id
    ).first()
    
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")
    
    try:
        current_qty = int(protein.Quantity) if protein.Quantity else 0
    except ValueError:
        current_qty = 0
    
    new_qty = current_qty + adjustment
    if new_qty < 0:
        raise HTTPException(status_code=400, detail="Stock cannot be negative")
    
    protein.Quantity = str(new_qty)
    
    # Recalculate computed fields based on new quantity
    try:
        landing_price = float(protein.LandingPrice) if protein.LandingPrice else 0
        selling_price = float(protein.SellingPrice) if protein.SellingPrice else 0
        protein.TotalPrice = str(round(landing_price * new_qty, 2))
        protein.ProfitAmount = round((selling_price - landing_price) * new_qty, 2)
    except (ValueError, TypeError):
        pass  # Keep existing values if conversion fails
    
    db.commit()
    db.refresh(protein)
    
    return {
        "message": f"Stock adjusted by {adjustment}",
        "previousQuantity": current_qty,
        "newQuantity": new_qty,
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
        'expiryDate': l.expiryDate
    } for l in lots]


@router.post("/{protein_id}/lots")
def create_protein_lot(
    protein_id: str,
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    protein = db.query(ProteinStock).filter(ProteinStock.id == protein_id, ProteinStock.gymId == current_gym.id).first()
    if not protein:
        raise HTTPException(status_code=404, detail="Protein not found")

    try:
        quantity = int(data.get('quantity') or 0)
    except (ValueError, TypeError):
        quantity = 0

    lot = ProteinLot(
        gymId=current_gym.id,
        proteinId=protein_id,
        lotNumber=data.get('lotNumber'),
        quantity=quantity,
        purchasePrice=float(data.get('purchasePrice')) if data.get('purchasePrice') else None,
        sellingPrice=float(data.get('sellingPrice')) if data.get('sellingPrice') else None,
        marginType=data.get('marginType'),
        marginValue=float(data.get('marginValue')) if data.get('marginValue') else None,
        offerPrice=float(data.get('offerPrice')) if data.get('offerPrice') else None,
        expiryDate=data.get('expiryDate')
    )
    db.add(lot)
    protein.AvailableStock = (protein.AvailableStock or 0) + (lot.quantity or 0)
    db.commit()
    db.refresh(lot)
    db.refresh(protein)

    return {
        'id': lot.id,
        'lotNumber': lot.lotNumber,
        'quantity': lot.quantity,
        'purchasePrice': lot.purchasePrice,
        'sellingPrice': lot.sellingPrice,
        'expiryDate': lot.expiryDate
    }


@router.put("/lots/{lot_id}")
def update_protein_lot(
    lot_id: str,
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    lot = db.query(ProteinLot).filter(ProteinLot.id == lot_id, ProteinLot.gymId == current_gym.id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    protein = db.query(ProteinStock).filter(ProteinStock.id == lot.proteinId, ProteinStock.gymId == current_gym.id).first()

    prev_qty = lot.quantity or 0
    try:
        new_qty = int(data.get('quantity')) if data.get('quantity') is not None else prev_qty
    except (ValueError, TypeError):
        new_qty = prev_qty

    # update fields
    for key in ['lotNumber', 'purchasePrice', 'sellingPrice', 'marginType', 'marginValue', 'offerPrice', 'expiryDate']:
        if key in data:
            setattr(lot, key, data.get(key))
    lot.quantity = new_qty

    # adjust product available stock
    if protein:
        protein.AvailableStock = (protein.AvailableStock or 0) - prev_qty + (lot.quantity or 0)

    db.commit()
    db.refresh(lot)
    if protein:
        db.refresh(protein)

    return {
        'id': lot.id,
        'lotNumber': lot.lotNumber,
        'quantity': lot.quantity,
        'purchasePrice': lot.purchasePrice,
        'sellingPrice': lot.sellingPrice,
        'expiryDate': lot.expiryDate
    }


@router.delete("/lots/{lot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_protein_lot(
    lot_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    lot = db.query(ProteinLot).filter(ProteinLot.id == lot_id, ProteinLot.gymId == current_gym.id).first()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    protein = db.query(ProteinStock).filter(ProteinStock.id == lot.proteinId, ProteinStock.gymId == current_gym.id).first()
    qty = lot.quantity or 0
    db.delete(lot)
    if protein:
        protein.AvailableStock = max(0, (protein.AvailableStock or 0) - qty)
    db.commit()
    return None
