from sqlalchemy import text
from core.database import engine

def drop_branchids_column():
    print("Dropping User.branchIds column and trigger...")
    with engine.connect() as conn:
        try:
            conn.execute(text('DROP TRIGGER IF EXISTS trg_validate_user_branch_ids ON "User";'))
            print("Dropped trigger trg_validate_user_branch_ids.")
        except Exception as e:
            print(f"Error dropping trigger: {e}")
            
        try:
            conn.execute(text('ALTER TABLE "User" DROP COLUMN IF EXISTS "branchIds";'))
            print("Dropped column branchIds from User.")
        except Exception as e:
            print(f"Error dropping column: {e}")
            
        try:
            conn.execute(text('DROP FUNCTION IF EXISTS validate_user_branch_ids();'))
            print("Dropped function validate_user_branch_ids.")
        except Exception as e:
            print(f"Error dropping function: {e}")
            
        conn.commit()
    print("Cleanup done.")

if __name__ == "__main__":
    drop_branchids_column()
