# How to Update/Add Columns to Tables

Quick guide for adding new columns to existing database tables in EZTRACK.

## Method 1: Startup Migration (Recommended)

Edit `backend/main.py` and add to the `migration_sqls` list:

```python
def run_startup_migrations():
    migration_sqls = [
        # ... existing migrations ...
        
        # Add your new column here
        'ALTER TABLE "TableName" ADD COLUMN IF NOT EXISTS "columnName" TYPE',
    ]
```

### Common Patterns

**String column:**
```python
'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "nickname" VARCHAR(100)',
```

**Integer with default:**
```python
'ALTER TABLE "ProteinStock" ADD COLUMN IF NOT EXISTS "minStock" INTEGER DEFAULT 0',
```

**Float column:**
```python
'ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "discount" FLOAT DEFAULT 0',
```

**Boolean:**
```python
'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "isVIP" BOOLEAN DEFAULT FALSE',
```

**Text (long strings):**
```python
'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "notes" TEXT',
```

**Image/Binary data:**
```python
'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "imageData" BYTEA',
'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "imageMimeType" VARCHAR(50)',
```

## Method 2: Direct pgAdmin SQL

1. Open pgAdmin → Select your database
2. Open Query Tool (Tools → Query Tool)
3. Run:

```sql
ALTER TABLE "TableName" ADD COLUMN IF NOT EXISTS "columnName" TYPE DEFAULT value;
```

## After Adding Column

1. **Update the SQLAlchemy model** in `backend/models/all_models.py`:

```python
class Member(Base):
    # ... existing columns ...
    nickname = Column(String(100))  # Add new column
```

2. **Update schemas** if needed in `backend/schemas/` for API validation

3. **Restart backend** to pick up changes

## Table Reference

| Table | Location |
|-------|----------|
| Member | `"Member"` |
| ProteinStock | `"ProteinStock"` |
| Invoice | `"Invoice"` |
| Expense | `"Expense"` |
| PendingBalance | `"PendingBalance"` |
| Gym | `"Gym"` |
| GymSettings | `"GymSettings"` |
