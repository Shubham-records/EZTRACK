# How to Migrate Database Tables

This guide covers database migrations in EZTRACK.

## Automatic Startup Migrations

EZTRACK runs migrations automatically on startup via `main.py`. These are located in the `run_startup_migrations()` function.

### Adding New Columns to Existing Tables

1. Open `backend/main.py`
2. Find the `migration_sqls` list in `run_startup_migrations()`
3. Add your new column SQL:

```python
migration_sqls = [
    # Existing migrations...
    
    # Your new migration - use IF NOT EXISTS to prevent errors
    'ALTER TABLE "TableName" ADD COLUMN IF NOT EXISTS "columnName" VARCHAR(255)',
]
```

### Supported Column Types

| Type | SQL Syntax |
|------|------------|
| String | `VARCHAR(255)` |
| Text | `TEXT` |
| Integer | `INTEGER` |
| Float | `FLOAT` |
| Boolean | `BOOLEAN` |
| Date | `DATE` |
| DateTime | `TIMESTAMP` |
| Binary | `BYTEA` |

### Example: Adding a new column

```python
'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "nickname" VARCHAR(100)',
'ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "isVIP" BOOLEAN DEFAULT FALSE',
```

## Manual Migrations via pgAdmin

1. Open pgAdmin and connect to your database
2. Navigate to: Databases → your_db → Schemas → public → Tables
3. Right-click the table → Properties → Columns → Add Column
4. Or use SQL directly:

```sql
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "newField" VARCHAR(255);
```

## Creating New Tables

New tables are automatically created via SQLAlchemy models:

1. Add your model to `backend/models/all_models.py`
2. Restart the backend - `Base.metadata.create_all()` will create the table

```python
class NewTable(Base):
    __tablename__ = "NewTable"
    
    id = Column(Integer, primary_key=True, index=True)
    gymId = Column(Integer, ForeignKey("Gym.id"))
    name = Column(String(255))
    createdAt = Column(DateTime, default=datetime.utcnow)
```

## Rollback/Undo Migrations

For manual rollback in pgAdmin:
```sql
ALTER TABLE "TableName" DROP COLUMN IF EXISTS "columnName";
```

> ⚠️ **Warning**: Always backup your database before running migrations in production!
