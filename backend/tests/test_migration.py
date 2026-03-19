import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
import uuid
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from main import app
from core.database import Base
from models.all_models import Gym
from core.security import get_password_hash

ACCEPTED_USERNAME = "api_test_gym_user"
ACCEPTED_PASSWORD = "testpassword123"

# Setup an async test engine
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

engine = create_async_engine(TEST_DATABASE_URL, echo=False)
TestingSessionLocal = sessionmaker(
    bind=engine, class_=AsyncSession, expire_on_commit=False
)

@pytest_asyncio.fixture(scope="module")
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

@pytest_asyncio.fixture(scope="module")
async def db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        
    async with TestingSessionLocal() as session:
        # Create Test Gym
        test_gym = Gym(
            id=str(uuid.uuid4()),
            gymname="API Test Gym",
            email="apitest@example.com",
            username=ACCEPTED_USERNAME,
            password=get_password_hash(ACCEPTED_PASSWORD)
        )
        session.add(test_gym)
        await session.commit()
        await session.refresh(test_gym)
        
        yield session
        
        await session.delete(test_gym)
        await session.commit()

@pytest.mark.asyncio
async def test_login(client, db):
    response = await client.post("/api/auth/login", json={
        "username": ACCEPTED_USERNAME,
        "password": ACCEPTED_PASSWORD
    })
    assert response.status_code == 200
    data = response.json()
    assert "eztracker_jwt_access_control_token" in data
    assert data["message"] == "Login successful!"
    return data["eztracker_jwt_access_control_token"]

@pytest.mark.asyncio
async def test_member_lifecycle(client, db):
    token = await test_login(client, db)
    headers = {"Authorization": f"Bearer {token}"}
    
    res = await client.get("/api/members/", headers=headers)
    assert res.status_code == 200
    assert isinstance(res.json(), list)
    
    new_member_data = {
        "Name": "John Doe Test",
        "Mobile": 9999999999,
        "Age": 30,
        "Gender": "Male",
        "PlanType": "Monthly",
        "PlanPeriod": "1 Month",
        "LastPaymentAmount": 1000
    }
    
    res = await client.post("/api/members/", json=new_member_data, headers=headers)
    assert res.status_code == 201
    created_member = res.json()
    assert created_member["Name"] == "John Doe Test"
    assert created_member["invoiceCreated"] is True
    
    res = await client.get("/api/members/", headers=headers)
    members = res.json()
    assert len(members) >= 1

@pytest.mark.asyncio
async def test_new_modules(client, db):
    token = await test_login(client, db)
    headers = {"Authorization": f"Bearer {token}"}
    
    staff_data = {
        "username": "test_staff",
        "password": "password123",
        "role": "STAFF",
        "permissions": ["READ"]
    }
    res = await client.post("/api/staff/", json=staff_data, headers=headers)
    assert res.status_code == 201
    
    res = await client.get("/api/staff/", headers=headers)
    assert res.status_code == 200
    
    invoice_data = {
        "customerName": "Test Customer",
        "items": [
            {"description": "Protein Shake", "quantity": 1, "rate": 100, "amount": 100}
        ],
        "paymentMode": "CASH",
        "status": "PAID"
    }
    res = await client.post("/api/invoices/", json=invoice_data, headers=headers)
    assert res.status_code == 201
    
    res = await client.get("/api/invoices/", headers=headers)
    assert res.status_code == 200
    
    res = await client.get("/api/proteins/", headers=headers)
    assert res.status_code == 200
    
    res = await client.get("/api/dashboard/stats", headers=headers)
    assert res.status_code == 200
