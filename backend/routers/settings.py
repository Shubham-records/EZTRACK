from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import List

from core.database import get_async_db
from core.dependencies import get_current_gym, require_owner_or_manager
from models.all_models import Gym, GymSettings, PricingConfig
from schemas.settings import GymSettingsCreate, GymSettingsUpdate, GymSettingsResponse, BulkPricingMatrixRequest, BulkProteinPricingRequest, BulkPTPricingRequest
from schemas.pricing import PricingConfigCreate, PricingConfigUpdate, PricingConfigResponse
from core.cache import invalidate_gym_settings

router = APIRouter()


# ============ GYM SETTINGS ============

@router.get("", response_model=GymSettingsResponse)
@router.get("/", response_model=GymSettingsResponse)
async def get_settings(current_gym: Gym = Depends(get_current_gym), db: AsyncSession = Depends(get_async_db)):
    """Get gym settings. Creates default if not exists."""
    stmt = select(GymSettings).where(GymSettings.gymId == current_gym.id)
    res = await db.execute(stmt)
    settings = res.scalars().first()
    
    if not settings:
        # Create default settings
        settings = GymSettings(gymId=current_gym.id)
        db.add(settings)
        await db.commit()
        # await db.refresh(settings)
    
    return settings


@router.put("", response_model=GymSettingsResponse)
@router.put("/", response_model=GymSettingsResponse)
async def update_settings(
    data: GymSettingsUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Update gym settings."""
    stmt = select(GymSettings).where(GymSettings.gymId == current_gym.id)
    res = await db.execute(stmt)
    settings = res.scalars().first()
    
    if not settings:
        settings = GymSettings(gymId=current_gym.id)
        db.add(settings)
    
    # Update only provided fields
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(settings, key, value)
    
    await db.commit()
    # await db.refresh(settings)
    await invalidate_gym_settings(current_gym.id)
    return settings


# ============ PRICING CONFIG ============

@router.get("/pricing", response_model=List[PricingConfigResponse])
async def get_pricing_configs(
    config_type: str = None,  # "member" or "protein"
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get all pricing configurations."""
    stmt = select(PricingConfig).where(PricingConfig.gymId == current_gym.id)
    
    if config_type:
        stmt = stmt.where(PricingConfig.configType == config_type)
    
    stmt = stmt.where(PricingConfig.isActive == True)
    res = await db.execute(stmt)
    return res.scalars().all()


@router.post("/pricing", response_model=PricingConfigResponse, status_code=status.HTTP_201_CREATED)
async def create_pricing_config(
    data: PricingConfigCreate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Create a new pricing configuration."""
    config = PricingConfig(gymId=current_gym.id, **data.model_dump())
    db.add(config)
    await db.commit()
    # await db.refresh(config)
    return config


@router.put("/pricing/{config_id}", response_model=PricingConfigResponse)
async def update_pricing_config(
    config_id: str,
    data: PricingConfigUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Update a pricing configuration."""
    stmt = select(PricingConfig).where(
        PricingConfig.id == config_id,
        PricingConfig.gymId == current_gym.id
    )
    res = await db.execute(stmt)
    config = res.scalars().first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Pricing config not found")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(config, key, value)
    
    await db.commit()
    # await db.refresh(config)
    return config


@router.delete("/pricing/{config_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_pricing_config(
    config_id: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Soft delete a pricing configuration."""
    stmt = select(PricingConfig).where(
        PricingConfig.id == config_id,
        PricingConfig.gymId == current_gym.id
    )
    res = await db.execute(stmt)
    config = res.scalars().first()
    
    if not config:
        raise HTTPException(status_code=404, detail="Pricing config not found")
    
    config.isActive = False
    await db.commit()
    return None


# ============ MEMBER PRICING MATRIX ============

@router.get("/pricing/member-matrix")
async def get_member_pricing_matrix(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get member pricing as a matrix (plan × period)."""
    stmt = select(PricingConfig).where(
        PricingConfig.gymId == current_gym.id,
        PricingConfig.configType == "member",
        PricingConfig.isActive == True
    )
    res = await db.execute(stmt)
    configs = res.scalars().all()
    
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
async def update_member_pricing_bulk(
    data: BulkPricingMatrixRequest,  # SW-08: typed; { "matrix": { "Strength": { "Monthly": 1000 } } }
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Bulk update member pricing matrix.
    SW-08: Replaced raw dict with BulkPricingMatrixRequest. Body must be
    { "matrix": { "<PlanType>": { "<PeriodType>": <price> } } }.
    """
    for plan_type, periods in data.matrix.items():
        for period_type, price in periods.items():
            stmt = select(PricingConfig).where(
                PricingConfig.gymId == current_gym.id,
                PricingConfig.configType == "member",
                PricingConfig.planType == plan_type,
                PricingConfig.periodType == period_type
            )
            res = await db.execute(stmt)
            existing = res.scalars().first()
            if existing:
                existing.basePrice = float(price)
            else:
                db.add(PricingConfig(
                    gymId=current_gym.id,
                    configType="member",
                    planType=plan_type,
                    periodType=period_type,
                    basePrice=float(price)
                ))
    await db.commit()
    return {"message": "Pricing updated successfully"}


@router.delete("/pricing/member-matrix/{plan_type}")
async def delete_member_plan(
    plan_type: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Soft delete all pricing configs for a specific plan type."""
    stmt = select(PricingConfig).where(
        PricingConfig.gymId == current_gym.id,
        PricingConfig.configType == "member",
        PricingConfig.planType == plan_type,
        PricingConfig.isActive == True
    )
    res = await db.execute(stmt)
    configs = res.scalars().all()
    
    if not configs:
        raise HTTPException(status_code=404, detail="Plan not found")
    
    for config in configs:
        config.isActive = False
    
    await db.commit()
    return {"message": f"Plan '{plan_type}' deleted successfully"}


# ============ PROTEIN PRICING DEFAULTS ============

@router.get("/pricing/protein-defaults")
async def get_protein_pricing_defaults(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get protein pricing defaults by brand."""
    stmt = select(PricingConfig).where(
        PricingConfig.gymId == current_gym.id,
        PricingConfig.configType == "protein",
        PricingConfig.isActive == True
    )
    res = await db.execute(stmt)
    configs = res.scalars().all()
    
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
async def update_protein_pricing_bulk(
    data: BulkProteinPricingRequest,  # SW-08: typed; { "matrix": { "ON": { "marginType": ..., "marginValue": 15 } } }
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Bulk update protein pricing defaults by brand.
    SW-08: Replaced raw dict with BulkProteinPricingRequest. Body must be
    { "matrix": { "<BrandName>": { "marginType": ..., "marginValue": ..., "offerDiscount": ... } } }.
    """
    for brand_name, config_data in data.matrix.items():
        stmt = select(PricingConfig).where(
            PricingConfig.gymId == current_gym.id,
            PricingConfig.configType == "protein",
            PricingConfig.brandName == brand_name
        )
        res = await db.execute(stmt)
        existing = res.scalars().first()
        if existing:
            existing.marginType    = config_data.get("marginType", existing.marginType)
            existing.marginValue   = config_data.get("marginValue", existing.marginValue)
            existing.offerDiscount = config_data.get("offerDiscount", existing.offerDiscount)
        else:
            db.add(PricingConfig(
                gymId=current_gym.id,
                configType="protein",
                brandName=brand_name,
                basePrice=0,
                marginType=config_data.get("marginType"),
                marginValue=config_data.get("marginValue"),
                offerDiscount=config_data.get("offerDiscount", 0)
            ))
    await db.commit()
    return {"message": "Protein pricing defaults updated successfully"}


# ============ PERSONAL TRAINING PRICING MATRIX ============

@router.get("/pricing/pt-matrix")
async def get_pt_pricing_matrix(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get personal training pricing as a matrix (plan × period)."""
    stmt = select(PricingConfig).where(
        PricingConfig.gymId == current_gym.id,
        PricingConfig.configType == "pt",
        PricingConfig.isActive == True
    )
    res = await db.execute(stmt)
    configs = res.scalars().all()
    
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
async def update_pt_pricing_bulk(
    data: BulkPTPricingRequest,  # SW-08: typed; { "matrix": { "1-on-1": { "Monthly": 3000 } } }
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Bulk update personal training pricing matrix.
    SW-08: Replaced raw dict with BulkPTPricingRequest. Body must be
    { "matrix": { "<PlanType>": { "<PeriodType>": <price> } } }.
    """
    for plan_type, periods in data.matrix.items():
        for period_type, price in periods.items():
            stmt = select(PricingConfig).where(
                PricingConfig.gymId == current_gym.id,
                PricingConfig.configType == "pt",
                PricingConfig.planType == plan_type,
                PricingConfig.periodType == period_type
            )
            res = await db.execute(stmt)
            existing = res.scalars().first()
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
    
    await db.commit()
    return {"message": "PT pricing updated successfully"}


@router.delete("/pricing/pt-matrix/{plan_type}")
async def delete_pt_plan(
    plan_type: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
    _rbac=Depends(require_owner_or_manager)
):
    """Soft delete all PT pricing configs for a specific plan type."""
    stmt = select(PricingConfig).where(
        PricingConfig.gymId == current_gym.id,
        PricingConfig.configType == "pt",
        PricingConfig.planType == plan_type,
        PricingConfig.isActive == True
    )
    res = await db.execute(stmt)
    configs = res.scalars().all()
    
    if not configs:
        raise HTTPException(status_code=404, detail="PT plan not found")
    
    for config in configs:
        config.isActive = False
    
    await db.commit()
    return {"message": f"PT plan '{plan_type}' deleted successfully"}
