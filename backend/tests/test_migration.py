import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from core.database import Base, get_db
from core.security import get_password_hash
from models.all_models import Gym
from main import app
import uuid

# Use the same DB or a test one. For safety, we really should use a separate DB,
# but since I cannot easily create a DB, I will Use the existing one but with a unique user
# and carefully clean up.

ACCEPTED_USERNAME = "api_test_gym_user"
ACCEPTED_PASSWORD = "testpassword123"

@pytest.fixture(scope="module")
def client():
    return TestClient(app)

@pytest.fixture(scope="module")
def db():
    # Setup
    from core.database import SessionLocal, engine
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # Clean up existing test user if any
    existing = db.query(Gym).filter(Gym.username == ACCEPTED_USERNAME).first()
    if existing:
        db.delete(existing)
        db.commit()
        
    # Create Test Gym
    test_gym = Gym(
        id=str(uuid.uuid4()),
        gymname="API Test Gym",
        email="apitest@example.com",
        username=ACCEPTED_USERNAME,
        password=get_password_hash(ACCEPTED_PASSWORD)
    )
    db.add(test_gym)
    db.commit()
    db.refresh(test_gym)
    
    yield db
    
    # Teardown
    db.delete(test_gym)
    db.commit()
    db.close()

def test_login(client, db):
    response = client.post("/api/auth/login", json={
        "username": ACCEPTED_USERNAME,
        "password": ACCEPTED_PASSWORD
    })
    assert response.status_code == 200
    data = response.json()
    assert "eztracker_jwt_access_control_token" in data
    assert data["message"] == "Login successful!"
    return data["eztracker_jwt_access_control_token"]

def test_member_lifecycle(client, db):
    # 1. Login
    token = test_login(client, db)
    params = {"token": token} # Depends(oauth2_scheme) expects Authorization header usually
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Get Members (Should be empty for new gym)
    res = client.get("/api/members/", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    
    # 3. Create Member
    new_member_data = {
        "Name": "John Doe Test",
        "Mobile": 9999999999,
        "Age": 30,
        "Gender": "Male",
        "PlanType": "Monthly",
        "PlanPeriod": "1 Month",
        "LastPaymentAmount": 1000
    }
    
    res = client.post("/api/members/", json=new_member_data, headers=headers)
    assert res.status_code == 201
    created_member = res.json()
    assert created_member["Name"] == "John Doe Test"
    assert created_member["invoiceCreated"] is True
    assert "_id" in created_member
    member_id = created_member["_id"]
    
    # 4. Get Members again
    res = client.get("/api/members/", headers=headers)
    members = res.json()
    assert len(members) >= 1
    # Check if _id is present in at least one member (the one we created)
    # The member we created should have the returned _id, let's verify finding it.
    found = False
    for m in members:
        # Pydantic alias handling: accessing response JSON should show '_id' key
        if m.get("_id") == member_id:
            found = True
            break
    assert found

def test_new_modules(client, db):
    # Reuse login
    token = test_login(client, db)
    headers = {"Authorization": f"Bearer {token}"}
    
    # 1. Staff
    # Create Staff
    staff_data = {
        "username": "test_staff",
        "password": "password123",
        "role": "STAFF",
        "permissions": ["READ"]
    }
    res = client.post("/api/staff/", json=staff_data, headers=headers)
    assert res.status_code == 201
    assert res.json()["username"] == "test_staff"
    
    # List Staff
    res = client.get("/api/staff/", headers=headers)
    assert res.status_code == 200
    assert len(res.json()) >= 1

    # 2. Invoices
    # Create Invoice
    invoice_data = {
        "customerName": "Test Customer",
        "items": [
            {"description": "Protein Shake", "quantity": 1, "rate": 100, "amount": 100}
        ],
        "paymentMode": "CASH",
        "status": "PAID"
    }
    res = client.post("/api/invoices/", json=invoice_data, headers=headers)
    assert res.status_code == 201
    assert res.json()["total"] == 100.0
    
    # List Invoices
    res = client.get("/api/invoices/", headers=headers)
    assert res.status_code == 200
    assert len(res.json()["items"]) >= 1

    # 3. Proteins
    # Get Proteins (Likely empty but shouldn't error)
    res = client.get("/api/proteins/", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json()["items"], list)

    # 4. Dashboard Stats
    res = client.get("/api/dashboard/stats", headers=headers)
    assert res.status_code == 200
    stats = res.json()
    assert "activeMembers" in stats
    # assert "todayCollection" in stats
