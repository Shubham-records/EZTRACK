
# Sample data generation
SAMPLE_NAMES = [
    "Rahul Sharma", "Priya Patel", "Amit Kumar", "Sneha Gupta", "Vikram Singh",
    "Ananya Reddy", "Karan Mehta", "Pooja Verma", "Arjun Nair", "Divya Iyer",
    "Rohan Das", "Nisha Joshi", "Aditya Rao", "Megha Shah", "Sanjay Pillai",
    "Kavita Desai", "Nikhil Bose", "Ritika Malhotra", "Deepak Choudhary", "Swati Kapoor",
    "Manish Tiwari", "Anjali Mishra", "Rajesh Agarwal", "Sunita Bhatt", "Vivek Saxena"
]

PROTEIN_BRANDS = ["ON", "MyProtein", "MuscleBlaze", "Dymatize", "BSN", "MuscleTech", "GNC", "Isopure"]
PROTEIN_PRODUCTS = [
    ("Whey Protein", ["Chocolate", "Vanilla", "Strawberry", "Cookies & Cream"]),
    ("Mass Gainer", ["Chocolate", "Banana", "Vanilla"]),
    ("BCAA", ["Fruit Punch", "Watermelon", "Blue Raspberry"]),
    ("Creatine", ["Unflavored", "Lemon", "Orange"]),
    ("Pre-Workout", ["Fruit Punch", "Green Apple", "Blue Raspberry"])
]

EXPENSE_CATEGORIES = ["Rent", "Electricity", "Salaries", "Maintenance", "Supplies", "Marketing", "Equipment", "Insurance"]


@router.post("/seed-sample-data")
@rate_limit("5/minute")
def seed_sample_data(
    request: Request,
    members_count: int = 100,
    proteins_count: int = 50,
    current_gym: Gym = Depends(get_current_gym),
    db: Session = Depends(get_db),
    _rbac=Depends(require_owner),  # SEC-08: OWNER only
):
    """Generate sample data for testing. Requires OWNER role and ALLOW_SEED_DATA env var."""
    # SEC-08: Gate behind ALLOW_SEED_DATA env var (checked at request time)
    if not os.getenv("ALLOW_SEED_DATA", "false").lower() == "true":
        raise HTTPException(status_code=403, detail="Seed data not available in production")

    created = {"members": 0, "proteins": 0, "expenses": 0}
    
    # Generate members
    plan_types = ["Strength", "Cardio", "CrossFit", "Yoga", "Mixed"]
    plan_periods = ["Monthly", "Quarterly", "Half-Yearly", "Yearly"]
    statuses = ["Active", "Active", "Active", "Inactive", "Expired"]
    
    for i in range(members_count):
        name = random.choice(SAMPLE_NAMES) + f" {random.randint(1, 99)}"
        join_date = datetime.now() - timedelta(days=random.randint(1, 365))
        plan_period_days = {"Monthly": 30, "Quarterly": 90, "Half-Yearly": 180, "Yearly": 365}
        chosen_period = random.choice(plan_periods)
        expiry_date = join_date + timedelta(days=plan_period_days[chosen_period])
        
        member = Member(
            gymId=current_gym.id,
            Name=name,
            Gender=random.choice(["M", "F"]),
            Age=random.randint(18, 55),
            Mobile=str(9000000000 + random.randint(100000000, 999999999)),
            Whatsapp=str(9000000000 + random.randint(100000000, 999999999)),
            height=round(random.uniform(150, 190), 1),
            weight=random.randint(50, 100),
            PlanType=random.choice(plan_types),
            PlanPeriod=chosen_period,
            DateOfJoining=join_date.date(),
            MembershipExpiryDate=expiry_date.date(),
            NextDuedate=expiry_date.date(),  # computed_status reads NextDuedate
            LastPaymentAmount=random.choice([500, 1000, 1500, 2000, 2500, 3000, 5000]),
            Address=f"{random.randint(1, 500)}, Sector {random.randint(1, 50)}, City"
        )
        db.add(member)
        created["members"] += 1
    
    # Generate proteins
    for i in range(proteins_count):
        brand = random.choice(PROTEIN_BRANDS)
        product, flavours = random.choice(PROTEIN_PRODUCTS)
        landing_price = random.randint(1500, 4000)
        margin = random.randint(100, 500)
        offer = random.randint(0, 200)
        
        protein = ProteinStock(
            gymId=current_gym.id,
            Brand=brand,
            ProductName=f"{brand} {product}",
            Flavour=random.choice(flavours),
            Weight=random.choice(["1kg", "2kg", "2.5kg", "5lb"]),
            Quantity=random.randint(1, 20),
            StockThreshold=random.randint(3, 8),
            LandingPrice=float(landing_price),
            MRPPrice=float(landing_price + margin + 500),
            MarginPrice=float(margin),
            OfferPrice=float(offer),
            SellingPrice=float(landing_price + margin - offer),
        )
        db.add(protein)
        created["proteins"] += 1
    
    # Generate expenses
    for i in range(30):
        expense_date = datetime.now() - timedelta(days=random.randint(1, 90))
        expense = Expense(
            gymId=current_gym.id,
            category=random.choice(EXPENSE_CATEGORIES),
            amount=random.randint(500, 50000),
            date=expense_date.date(),
            paymentMode=random.choice(["Cash", "UPI", "Card", "Bank Transfer"]),
            notes=f"Sample expense #{i+1}"
        )
        db.add(expense)
        created["expenses"] += 1
    
    db.commit()
    
    return {
        "success": True,
        "message": f"Generated {created['members']} members, {created['proteins']} proteins, {created['expenses']} expenses",
        "created": created
    }
