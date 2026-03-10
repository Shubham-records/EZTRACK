import html
import re
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from typing import Optional

from core.database import get_db
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


_initialized_gyms: set[str] = set()


def ensure_default_templates(gym_id: str, db: Session):
    """Create default templates for a gym if they don't exist.
    Uses in-memory cache to skip the DB check after first initialization per process.
    """
    if gym_id in _initialized_gyms:
        return

    count = db.query(WhatsAppTemplate).filter(
        WhatsAppTemplate.gymId == gym_id
    ).count()
    if count >= len(DEFAULT_TEMPLATES):
        _initialized_gyms.add(gym_id)
        return  # Already initialised, skip all work

    existing = db.query(WhatsAppTemplate).filter(
        WhatsAppTemplate.gymId == gym_id
    ).all()
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

    db.commit()
    _initialized_gyms.add(gym_id)


@router.get("")
def get_all_templates(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get all WhatsApp templates for this gym. Creates defaults if none exist."""
    ensure_default_templates(current_gym.id, db)

    templates = db.query(WhatsAppTemplate).filter(
        WhatsAppTemplate.gymId == current_gym.id
    ).all()

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
def get_template_by_type(
    template_type: str,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get a specific template by type."""
    ensure_default_templates(current_gym.id, db)

    template = db.query(WhatsAppTemplate).filter(
        WhatsAppTemplate.gymId == current_gym.id,
        WhatsAppTemplate.templateType == template_type
    ).first()

    if not template:
        raise HTTPException(status_code=404, detail=f"Template for '{template_type}' not found")

    return {
        "id": template.id,
        "templateType": template.templateType,
        "messageTemplate": template.messageTemplate,
        "isActive": template.isActive,
    }


@router.put("/{template_type}")
def update_template(
    template_type: str,
    data: WhatsAppTemplateUpdate,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Create or update a template for a specific type."""
    if template_type not in VALID_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {VALID_TYPES}")

    template = db.query(WhatsAppTemplate).filter(
        WhatsAppTemplate.gymId == current_gym.id,
        WhatsAppTemplate.templateType == template_type
    ).first()

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

    db.commit()
    db.refresh(template)

    return {
        "id": template.id,
        "templateType": template.templateType,
        "messageTemplate": template.messageTemplate,
        "isActive": template.isActive,
    }


@router.post("/preview")
@rate_limit("30/minute")
def preview_template(
    request: Request,
    data: dict,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
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
