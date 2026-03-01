import sys
import os
import argparse

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'backend')))

from core.database import SessionLocal
from routers.auth import cleanup_expired_refresh_tokens

def main():
    db = SessionLocal()
    try:
        cleanup_expired_refresh_tokens(db)
        print("Cleanup completed successfully.")
    except Exception as e:
        db.rollback()
        print(f"Error during cleanup: {e}")
        sys.exit(1)
    finally:
        db.close()

if __name__ == "__main__":
    main()
