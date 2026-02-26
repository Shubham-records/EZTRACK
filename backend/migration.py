from sqlalchemy import text
from core.database import engine

def add_columns():
    # List of columns to check and add
    columns_to_check = [
        ("expiryRange", "INTEGER DEFAULT 30"),
        ("admissionExpiryDays", "INTEGER DEFAULT 365"),
        ("readmissionDiscount", "INTEGER DEFAULT 50"),
        ("admissionFee", "FLOAT DEFAULT 0.0"),
        ("reAdmissionFee", "FLOAT DEFAULT 0.0")
    ]

    for col_name, col_def in columns_to_check:
        try:
            with engine.connect() as conn:
                conn.execute(text(f'ALTER TABLE "GymSettings" ADD COLUMN "{col_name}" {col_def}'))
                conn.commit()
                print(f"Added {col_name} column")
        except Exception:
            # Column already exists — safe to ignore
            pass

    # PERF-1: Partial index for computed_status queries
    try:
        with engine.connect() as conn:
            conn.execute(text("""
                CREATE INDEX IF NOT EXISTS ix_member_gym_active
                ON "Member" ("gymId", "NextDuedate")
                WHERE "NextDuedate" IS NOT NULL
            """))
            conn.commit()
            print("Added ix_member_gym_active partial index")
    except Exception as e:
        print(f"ix_member_gym_active index might already exist: {e}")

    print("Migration check completed successfully")

if __name__ == "__main__":
    add_columns()

