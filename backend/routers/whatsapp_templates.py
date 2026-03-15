import html
import re
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from typing import Optional

from core.database import get_db, get_async_db
from core.dependencies import get_current_gym
from core.rate_limit import rate_limit
from models.all_models import Gym, WhatsAppTemplate
from schemas.whatsapp import WhatsAppTemplateCreate, WhatsAppTemplateUpdate, WhatsAppTemplateResponse

router = APIRouter()

VALID_TYPES = ["Admission", "Re-Admission", "Renewal", "Protein"]

# SEC-11: Allowlist of supported template placeholder names.
# Any {unknown_var} in a template is rejected at save time to prevent injection.
ALLOWED_PLACEHOLDERS = frozenset({
    "customerName", "gymName", "total", "paidAmount", "balance",
    "planType", "planPeriod", "date", "paymentMode", "branchName",
    "expiryDate", "receiptNumber",
})


def _validate_template_placeholders(template_text: str) -> None:
    """Raise HTTPException if template contains any non-allowlisted {placeholder}."""
    found = re.findall(r"\{(\w+)\}", template_text)
    invalid = [p for p in found if p not in ALLOWED_PLACEHOLDERS]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid template placeholders: {invalid}. Allowed: {sorted(ALLOWED_PLACEHOLDERS)}",
        )


DEFAULT_TEMPLATES = {
    "Admission": "Hi {customerName}! 🙏 Welcome to {gymName}! Your membership is now active. Please find your invoice attached. Stay fit! 💪",
    "Re-Admission": "Hi {customerName}! 🙏 Welcome back to {gymName}! Great to see you again. Please find your invoice attached. Let's crush it! 💪",
    "Renewal": "Hi {customerName}! 🙏 Thank you for renewing with {gymName}! Your membership has been updated. Please find your invoice attached. Keep going strong! 💪",
    "Protein": "Hi {customerName}! 🙏 Thank you for your purchase from {gymName}! Please find your invoice attached. Fuel your fitness! 💪",
}

import time

_initialized_gyms: dict[str, float] = {}
CACHE_TTL = 3600 * 24  # 24 hours

def _is_initialized(gym_id: str) -> bool:
    now = time.time()
    if gym_id in _initialized_gyms:
        if now - _initialized_gyms[gym_id] < CACHE_TTL:
            return True
        else:
            del _initialized_gyms[gym_id]
            
    # Cleanup expired entries periodically to prevent memory leaks
    if len(_initialized_gyms) > 1000:
        expired = [k for k, v in _initialized_gyms.items() if now - v >= CACHE_TTL]
        for k in expired:
            del _initialized_gyms[k]
            
    return False

def _set_initialized(gym_id: str) -> None:
    _initialized_gyms[gym_id] = time.time()

from sqlalchemy import func

async def ensure_default_templates(gym_id: str, db: AsyncSession):
    """Create default templates for a gym if they don't exist.
    Uses in-memory cache with TTL to skip the DB check after first initialization.
    """
    if _is_initialized(gym_id):
        return

    count_stmt = select(func.count(WhatsAppTemplate.id)).where(WhatsAppTemplate.gymId == gym_id)
    count_res = await db.execute(count_stmt)
    count = count_res.scalar() or 0

    if count >= len(DEFAULT_TEMPLATES):
        _set_initialized(gym_id)
        return  # Already initialised, skip all work

    stmt_all = select(WhatsAppTemplate).where(WhatsAppTemplate.gymId == gym_id)
    res_all = await db.execute(stmt_all)
    existing = res_all.scalars().all()
    existing_types = {t.templateType for t in existing}

    for t_type, t_msg in DEFAULT_TEMPLATES.items():
        if t_type not in existing_types:
            template = WhatsAppTemplate(
                gymId=gym_id,
                templateType=t_type,
                messageTemplate=t_msg,
                isActive=True,
            )
            db.add(template)

    await db.commit()
    _set_initialized(gym_id)


@router.get("")
async def get_all_templates(
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get all WhatsApp templates for this gym. Creates defaults if none exist."""
    await ensure_default_templates(current_gym.id, db)

    stmt = select(WhatsAppTemplate).where(WhatsAppTemplate.gymId == current_gym.id)
    res = await db.execute(stmt)
    templates = res.scalars().all()

    return [
        {
            "id": t.id,
            "templateType": t.templateType,
            "messageTemplate": t.messageTemplate,
            "isActive": t.isActive,
        }
        for t in templates
    ]


@router.get("/{template_type}")
async def get_template_by_type(
    template_type: str,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Get a specific template by type."""
    await ensure_default_templates(current_gym.id, db)

    stmt = select(WhatsAppTemplate).where(
        WhatsAppTemplate.gymId == current_gym.id,
        WhatsAppTemplate.templateType == template_type
    )
    res = await db.execute(stmt)
    template = res.scalars().first()

    if not template:
        raise HTTPException(status_code=404, detail=f"Template for '{template_type}' not found")

    return {
        "id": template.id,
        "templateType": template.templateType,
        "messageTemplate": template.messageTemplate,
        "isActive": template.isActive,
    }


@router.put("/{template_type}")
async def update_template(
    template_type: str,
    data: WhatsAppTemplateUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db)
):
    """Create or update a template for a specific type."""
    if template_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {VALID_TYPES}")

    stmt = select(WhatsAppTemplate).where(
        WhatsAppTemplate.gymId == current_gym.id,
        WhatsAppTemplate.templateType == template_type
    )
    res = await db.execute(stmt)
    template = res.scalars().first()

    if not template:
        if data.messageTemplate:
            _validate_template_placeholders(data.messageTemplate)  # SEC-11
        template = WhatsAppTemplate(
            gymId=current_gym.id,
            templateType=template_type,
            messageTemplate=data.messageTemplate or DEFAULT_TEMPLATES.get(template_type, ""),
            isActive=True,
        )
        db.add(template)
    else:
        if data.messageTemplate is not None:
            _validate_template_placeholders(data.messageTemplate)  # SEC-11
            template.messageTemplate = data.messageTemplate
        if data.isActive is not None:
            template.isActive = data.isActive

    await db.commit()
    # await db.refresh(template)

    return {
        "id": template.id,
        "templateType": template.templateType,
        "messageTemplate": template.messageTemplate,
        "isActive": template.isActive,
    }


@router.post("/preview")
@rate_limit("30/minute")
async def preview_template(
    request: Request,
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: AsyncSession = Depends(get_async_db),
):
    """Preview a rendered template. Returns PLAIN TEXT — never HTML.
    SEC-11: All substitution values are HTML-escaped before insertion.
    SEC-NEW-06: Template text is validated against the allowlist before rendering.
    """
    template_text = data.get("messageTemplate", "")
    sample_data = data.get("sampleData", {})

    # SEC-NEW-06: Validate placeholders before rendering — prevent probing and injection
    if template_text:
        _validate_template_placeholders(template_text)

    defaults = {
        "customerName": "John Doe",
        "gymName": current_gym.gymname or "Your Gym",
        "total": "3,000",
        "paidAmount": "3,000",
        "balance": "0",
        "planType": "Strength",
        "planPeriod": "Monthly",
        "date": "25/02/2026",
        "paymentMode": "CASH",
        "branchName": "Main Branch",
    }
    defaults.update(sample_data)

    rendered = template_text
    for key, value in defaults.items():
        # SEC-11: Escape HTML special chars in user-supplied values
        safe_value = html.escape(str(value))
        rendered = rendered.replace("{" + key + "}", safe_value)

    # Strip any residual HTML tags from the template body itself
    rendered = re.sub(r"<[^>]+>", "", rendered)

    return {"rendered": rendered, "format": "plain_text"}
