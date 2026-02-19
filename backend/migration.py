from sqlalchemy import text
from core.database import engine

def add_columns():
    with engine.connect() as conn:
        try:
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
                    conn.execute(text(f"ALTER TABLE \"GymSettings\" ADD COLUMN \"{col_name}\" {col_def}"))
                    print(f"Added {col_name} column")
                except Exception as e:
                    # Generic catch because Postgres throws error if column exists
                    # print(f"{col_name} column might already exist or error: {str(e)}")
                    pass
                
            conn.commit()
            print("Migration check completed successfully")
        except Exception as e:
            print(f"Migration failed: {str(e)}")

if __name__ == "__main__":
    add_columns()
