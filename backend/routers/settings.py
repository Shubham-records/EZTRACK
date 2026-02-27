from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from core.dependencies import get_current_gym, require_owner_or_manager
from models.all_models import Gym, GymSettings, PricingConfig
from schemas.settings import GymSettingsCreate, GymSettingsUpdate, GymSettingsResponse
from schemas.pricing import PricingConfigCreate, PricingConfigUpdate, PricingConfigResponse

router = APIRouter()


# ============ GYM SETTINGS ============

@router.get("", response_model=GymSettingsResponse)
@router.get("/", response_model=GymSettingsResponse)
def get_settings(current_gym: Gym = Depends(get_current_gym), db: Session = Depends(get_db)):
    """Get gym settings. Creates default if not exists."""
    settings = db.query(GymSettings).filter(GymSettings.gymId == current_gym.id).first()
    
    if not settings:
        # Create default settings
        settings = GymSettings(gymId=current_gym.id)
        db.add(settings)
        db.commit()
        db.refresh(settings)
    
    return settings


@router.put("", response_model=GymSettingsResponse)
@router.put("/", response_model=GymSettingsResponse)
def update_settings(
    data: GymSettingsUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Update gym settings."""
    settings = db.query(GymSettings).filter(GymSettings.gymId == current_gym.id).first()
    
    if not settings:
        settings = GymSettings(gymId=current_gym.id)
        db.add(settings)
    
    # Update only provided fields
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)
    
    db.commit()
    db.refresh(settings)
    return settings


# ============ PRICING CONFIG ============

@router.get("/pricing", response_model=List[PricingConfigResponse])
def get_pricing_configs(
    config_type: str = None,  # "member" or "protein"
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get all pricing configurations."""
    query = db.query(PricingConfig).filter(PricingConfig.gymId == current_gym.id)
    
    if config_type:
        query = query.filter(PricingConfig.configType == config_type)
    
    return query.filter(PricingConfig.isActive == True).all()


@router.post("/pricing", response_model=PricingConfigResponse, status_code=status.HTTP_201_CREATED)
def create_pricing_config(
    data: PricingConfigCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Create a new pricing configuration."""
    config = PricingConfig(gymId=current_gym.id, **data.model_dump())
    db.add(config)
    db.commit()
    db.refresh(config)
    return config


@router.put("/pricing/{config_id}", response_model=PricingConfigResponse)
def update_pricing_config(
    config_id: str,
    data: PricingConfigUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Update a pricing configuration."""
    config = db.query(PricingConfig).filter(
        PricingConfig.id == config_id,
        PricingConfig.gymId == current_gym.id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Pricing config not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)
    
    db.commit()
    db.refresh(config)
    return config


@router.delete("/pricing/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_pricing_config(
    config_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Soft delete a pricing configuration."""
    config = db.query(PricingConfig).filter(
        PricingConfig.id == config_id,
        PricingConfig.gymId == current_gym.id
    ).first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Pricing config not found")
    
    config.isActive = False
    db.commit()
    return None


# ============ MEMBER PRICING MATRIX ============

@router.get("/pricing/member-matrix")
def get_member_pricing_matrix(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get member pricing as a matrix (plan × period)."""
    configs = db.query(PricingConfig).filter(
        PricingConfig.gymId == current_gym.id,
        PricingConfig.configType == "member",
        PricingConfig.isActive == True
    ).all()
    
    # Build matrix
    matrix = {}
    for config in configs:
        if config.planType not in matrix:
            matrix[config.planType] = {}
        matrix[config.planType][config.periodType] = {
            "id": config.id,
            "price": config.basePrice,
            "offerDiscount": config.offerDiscount
        }
    
    return matrix


@router.post("/pricing/member-matrix/bulk")
def update_member_pricing_bulk(
    data: dict,  # { "Strength": { "Monthly": 1000, "Quarterly": 2700 }, ... }
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Bulk update member pricing matrix."""
    for plan_type, periods in data.items():
        for period_type, price in periods.items():
            # Check if exists
            existing = db.query(PricingConfig).filter(
                PricingConfig.gymId == current_gym.id,
                PricingConfig.configType == "member",
                PricingConfig.planType == plan_type,
                PricingConfig.periodType == period_type
            ).first()
            
            if existing:
                existing.basePrice = float(price)
            else:
                new_config = PricingConfig(
                    gymId=current_gym.id,
                    configType="member",
                    planType=plan_type,
                    periodType=period_type,
                    basePrice=float(price)
                )
                db.add(new_config)
    
    db.commit()
    return {"message": "Pricing updated successfully"}


@router.delete("/pricing/member-matrix/{plan_type}")
def delete_member_plan(
    plan_type: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Soft delete all pricing configs for a specific plan type."""
    configs = db.query(PricingConfig).filter(
        PricingConfig.gymId == current_gym.id,
        PricingConfig.configType == "member",
        PricingConfig.planType == plan_type,
        PricingConfig.isActive == True
    ).all()
    
    if not configs:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    for config in configs:
        config.isActive = False
    
    db.commit()
    return {"message": f"Plan '{plan_type}' deleted successfully"}


# ============ PROTEIN PRICING DEFAULTS ============

@router.get("/pricing/protein-defaults")
def get_protein_pricing_defaults(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get protein pricing defaults by brand."""
    configs = db.query(PricingConfig).filter(
        PricingConfig.gymId == current_gym.id,
        PricingConfig.configType == "protein",
        PricingConfig.isActive == True
    ).all()
    
    # Build brand defaults
    defaults = {}
    for config in configs:
        defaults[config.brandName] = {
            "id": config.id,
            "marginType": config.marginType,
            "marginValue": config.marginValue,
            "offerDiscount": config.offerDiscount
        }
    
    return defaults


@router.post("/pricing/protein-defaults/bulk")
def update_protein_pricing_bulk(
    data: dict,  # { "ON": { "marginType": "percentage", "marginValue": 15 }, ... }
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Bulk update protein pricing defaults by brand."""
    for brand_name, config_data in data.items():
        existing = db.query(PricingConfig).filter(
            PricingConfig.gymId == current_gym.id,
            PricingConfig.configType == "protein",
            PricingConfig.brandName == brand_name
        ).first()
        
        if existing:
            existing.marginType = config_data.get("marginType", existing.marginType)
            existing.marginValue = config_data.get("marginValue", existing.marginValue)
            existing.offerDiscount = config_data.get("offerDiscount", existing.offerDiscount)
        else:
            new_config = PricingConfig(
                gymId=current_gym.id,
                configType="protein",
                brandName=brand_name,
                basePrice=0,  # Not applicable for protein defaults
                marginType=config_data.get("marginType"),
                marginValue=config_data.get("marginValue"),
                offerDiscount=config_data.get("offerDiscount", 0)
            )
            db.add(new_config)
    
    db.commit()
    return {"message": "Protein pricing defaults updated successfully"}


# ============ PERSONAL TRAINING PRICING MATRIX ============

@router.get("/pricing/pt-matrix")
def get_pt_pricing_matrix(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get personal training pricing as a matrix (plan × period)."""
    configs = db.query(PricingConfig).filter(
        PricingConfig.gymId == current_gym.id,
        PricingConfig.configType == "pt",
        PricingConfig.isActive == True
    ).all()
    
    # Build matrix
    matrix = {}
    for config in configs:
        if config.planType not in matrix:
            matrix[config.planType] = {}
        matrix[config.planType][config.periodType] = {
            "id": config.id,
            "price": config.basePrice,
            "offerDiscount": config.offerDiscount
        }
    
    return matrix


@router.post("/pricing/pt-matrix/bulk")
def update_pt_pricing_bulk(
    data: dict,  # { "1-on-1": { "Monthly": 3000 }, ... }
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Bulk update personal training pricing matrix."""
    for plan_type, periods in data.items():
        for period_type, price in periods.items():
            existing = db.query(PricingConfig).filter(
                PricingConfig.gymId == current_gym.id,
                PricingConfig.configType == "pt",
                PricingConfig.planType == plan_type,
                PricingConfig.periodType == period_type
            ).first()
            
            if existing:
                existing.basePrice = float(price)
            else:
                new_config = PricingConfig(
                    gymId=current_gym.id,
                    configType="pt",
                    planType=plan_type,
                    periodType=period_type,
                    basePrice=float(price)
                )
                db.add(new_config)
    
    db.commit()
    return {"message": "PT pricing updated successfully"}


@router.delete("/pricing/pt-matrix/{plan_type}")
def delete_pt_plan(
    plan_type: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Soft delete all PT pricing configs for a specific plan type."""
    configs = db.query(PricingConfig).filter(
        PricingConfig.gymId == current_gym.id,
        PricingConfig.configType == "pt",
        PricingConfig.planType == plan_type,
        PricingConfig.isActive == True
    ).all()
    
    if not configs:
        raise HTTPException(status_code=404, detail="PT plan not found")
    
    for config in configs:
        config.isActive = False
    
    db.commit()
    return {"message": f"PT plan '{plan_type}' deleted successfully"}
