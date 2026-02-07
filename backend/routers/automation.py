from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta
import urllib.parse

from core.database import get_db
from core.dependencies import get_current_gym
from models.all_models import Gym, Member, ProteinStock, PendingBalance

router = APIRouter()


@router.get("/expiring-memberships")
def get_expiring_memberships(
    days: int = 7,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get memberships expiring within the specified days."""
    today = datetime.now().date()
    end_date = today + timedelta(days=days)
    
    members = db.query(Member).filter(
        Member.gymId == current_gym.id,
        Member.MembershipStatus == 'Active'
    ).all()
    
    expiring = []
    for m in members:
        if m.MembershipExpiryDate:
            try:
                exp_date = datetime.strptime(m.MembershipExpiryDate, '%Y-%m-%d').date()
                if today <= exp_date <= end_date:
                    expiring.append({
                        'id': m.id,
                        'name': m.Name,
                        'phone': m.Mobile or m.Whatsapp,
                        'expiryDate': m.MembershipExpiryDate,
                        'daysLeft': (exp_date - today).days,
                        'planType': m.PlanType,
                        'planPeriod': m.PlanPeriod
                    })
            except:
                pass
    
    expiring.sort(key=lambda x: x['daysLeft'])
    return expiring


@router.get("/low-stock-items")
def get_low_stock_items(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get products with low stock."""
    proteins = db.query(ProteinStock).filter(
        ProteinStock.gymId == current_gym.id
    ).all()
    
    low_stock = []
    for p in proteins:
        threshold = p.StockThreshold or 5
        if (p.AvailableStock or 0) < threshold:
            low_stock.append({
                'id': p.id,
                'productName': p.ProductName,
                'brand': p.Brand,
                'currentStock': p.AvailableStock or 0,
                'threshold': threshold,
                'sellingPrice': p.SellingPrice or p.LandingPrice
            })
    
    low_stock.sort(key=lambda x: x['currentStock'])
    return low_stock


@router.get("/overdue-payments")
def get_overdue_payments(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Get overdue pending payments."""
    today = datetime.now().strftime('%Y-%m-%d')
    
    pending = db.query(PendingBalance).filter(
        PendingBalance.gymId == current_gym.id,
        PendingBalance.status.in_(['pending', 'partial']),
        PendingBalance.dueDate < today
    ).all()
    
    return [{
        'id': p.id,
        'entityName': p.entityName,
        'entityType': p.entityType,
        'phone': p.phone,
        'amount': p.amount - (p.paidAmount or 0),
        'dueDate': p.dueDate
    } for p in pending]


@router.get("/smart-suggestions")
def get_smart_suggestions(
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Generate smart suggestions based on current data."""
    suggestions = []
    
    # Check for expiring memberships
    today = datetime.now().date()
    upcoming = today + timedelta(days=3)
    
    members = db.query(Member).filter(
        Member.gymId == current_gym.id,
        Member.MembershipStatus == 'Active'
    ).all()
    
    expiring_soon = 0
    for m in members:
        if m.MembershipExpiryDate:
            try:
                exp_date = datetime.strptime(m.MembershipExpiryDate, '%Y-%m-%d').date()
                if today <= exp_date <= upcoming:
                    expiring_soon += 1
            except:
                pass
    
    if expiring_soon > 0:
        suggestions.append({
            'type': 'warning',
            'title': 'Memberships Expiring Soon',
            'message': f'{expiring_soon} membership(s) expiring in the next 3 days. Send renewal reminders.',
            'action': 'view_expiring'
        })
    
    # Check for low stock
    proteins = db.query(ProteinStock).filter(ProteinStock.gymId == current_gym.id).all()
    low_stock_count = sum(1 for p in proteins if (p.AvailableStock or 0) < (p.StockThreshold or 5))
    
    if low_stock_count > 0:
        suggestions.append({
            'type': 'alert',
            'title': 'Low Stock Alert',
            'message': f'{low_stock_count} product(s) are running low on stock. Consider restocking.',
            'action': 'view_low_stock'
        })
    
    # Check for overdue payments
    today_str = datetime.now().strftime('%Y-%m-%d')
    overdue = db.query(PendingBalance).filter(
        PendingBalance.gymId == current_gym.id,
        PendingBalance.status.in_(['pending', 'partial']),
        PendingBalance.dueDate < today_str
    ).count()
    
    if overdue > 0:
        suggestions.append({
            'type': 'warning',
            'title': 'Overdue Payments',
            'message': f'{overdue} payment(s) are overdue. Follow up for collection.',
            'action': 'view_overdue'
        })
    
    return suggestions


@router.post("/bulk-whatsapp-reminder")
def generate_bulk_whatsapp_links(
    reminder_type: str = 'expiring',  # 'expiring', 'overdue'
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db)
):
    """Generate WhatsApp links for bulk reminders."""
    links = []
    
    if reminder_type == 'expiring':
        today = datetime.now().date()
        end_date = today + timedelta(days=7)
        
        members = db.query(Member).filter(
            Member.gymId == current_gym.id,
            Member.MembershipStatus == 'Active'
        ).all()
        
        for m in members:
            if m.MembershipExpiryDate:
                try:
                    exp_date = datetime.strptime(m.MembershipExpiryDate, '%Y-%m-%d').date()
                    if today <= exp_date <= end_date:
                        phone = m.Mobile or m.Whatsapp
                        if phone:
                            phone_clean = str(phone).replace("+", "").replace(" ", "")
                            if not phone_clean.startswith("91"):
                                phone_clean = "91" + phone_clean
                            
                            days_left = (exp_date - today).days
                            message = f"Hi {m.Name}, your gym membership expires in {days_left} day(s) on {m.MembershipExpiryDate}. Please renew to continue your fitness journey! Visit us or call for renewal."
                            encoded = urllib.parse.quote(message)
                            
                            links.append({
                                'name': m.Name,
                                'phone': phone,
                                'expiryDate': m.MembershipExpiryDate,
                                'daysLeft': days_left,
                                'link': f"https://web.whatsapp.com/send?phone={phone_clean}&text={encoded}"
                            })
                except:
                    pass
    
    elif reminder_type == 'overdue':
        today_str = datetime.now().strftime('%Y-%m-%d')
        
        pending = db.query(PendingBalance).filter(
            PendingBalance.gymId == current_gym.id,
            PendingBalance.status.in_(['pending', 'partial']),
            PendingBalance.dueDate < today_str
        ).all()
        
        for p in pending:
            if p.phone:
                phone_clean = str(p.phone).replace("+", "").replace(" ", "")
                if not phone_clean.startswith("91"):
                    phone_clean = "91" + phone_clean
                
                remaining = p.amount - (p.paidAmount or 0)
                message = f"Hi {p.entityName}, this is a reminder about your pending payment of ₹{remaining:.2f}. The due date was {p.dueDate}. Please clear at your earliest convenience. Thank you!"
                encoded = urllib.parse.quote(message)
                
                links.append({
                    'name': p.entityName,
                    'phone': p.phone,
                    'amount': remaining,
                    'dueDate': p.dueDate,
                    'link': f"https://web.whatsapp.com/send?phone={phone_clean}&text={encoded}"
                })
    
    return links
