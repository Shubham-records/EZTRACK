import asyncio
import logging
import sys
import os
import json
from datetime import datetime, timedelta, timezone

# Add backend directory to sys.path so we can import from core and models
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import async_engine, AsyncSessionLocal
from models.all_models import Gym, User, Member, ProteinStock, ProteinLot, Expense, SoftDeleteArchive

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger("archive_script")

# Map of table identifiers to SQLAlchemy classes that have `isDeleted` and `deletedAt`
SOFT_DELETE_MODELS = [
    ("Gym", Gym),
    ("User", User),
    ("Member", Member),
    ("ProteinStock", ProteinStock),
    ("ProteinLot", ProteinLot),
    ("Expense", Expense)
]

def default_serializer(obj):
    """Fallback serializer for dates and UUIDs."""
    if hasattr(obj, "isoformat"):
        return obj.isoformat()
    return str(obj)

async def archive_soft_deletes():
    """
    WA-03 Implementation:
    Move rows with `isDeleted=true AND deletedAt < NOW - 90 days` to `SoftDeleteArchive`.
    This mitigates index bloat and allows standard PostgreSQL VACUUM to reclaim space
    without the downtime penalty of VACUUM FULL.
    """
    cutoff_date = datetime.now(timezone.utc) - timedelta(days=90)
    logger.info(f"Starting Soft Delete Archive Job (Cutoff: {cutoff_date.isoformat()})")
    
    async with AsyncSessionLocal() as db:
        for table_name, model in SOFT_DELETE_MODELS:
            logger.info(f"Processing model: {table_name}")
            try:
                # 1. Find rows eligible for archival
                stmt = select(model).where(
                    model.isDeleted == True,
                    model.deletedAt < cutoff_date
                )
                res = await db.execute(stmt)
                rows_to_archive = res.scalars().all()
                
                if not rows_to_archive:
                    logger.info(f"  {table_name} has 0 rows eligible for archival.")
                    continue
                
                logger.info(f"  {table_name}: Found {len(rows_to_archive)} rows to archive.")
                
                # 2. Extract into JSON payload and stage insertion into Archive table
                #    We keep it in the same transaction as the deletion to avoid data loss on crash.
                for row in rows_to_archive:
                    # serialize to dict using columns
                    row_dict = {
                        c.name: getattr(row, c.name) for c in row.__table__.columns
                    }
                    
                    gym_id_val = getattr(row, "gymId", "SYSTEM")
                    if gym_id_val is None:
                        gym_id_val = "SYSTEM" # safety fallback for rows lacking gymId

                    archive_entry = SoftDeleteArchive(
                        gymId=gym_id_val,
                        originalTable=table_name,
                        originalId=str(row.id),
                        payload=json.dumps(row_dict, default=default_serializer),
                        deletedAt=row.deletedAt
                    )
                    db.add(archive_entry)
                
                # 3. Create hard delete statement
                ids_to_delete = [row.id for row in rows_to_archive]
                
                # SQLAlchemy allows .in_() efficiently for lists. If lists are thousands, we'd batch,
                # but archive job running daily shouldn't hit huge chunks per execution.
                delete_stmt = delete(model).where(model.id.in_(ids_to_delete))
                await db.execute(delete_stmt)
                
                logger.info(f"  {table_name}: Successfully staged for deletion and archive.")
            
            except Exception as e:
                logger.error(f"  Failed processing {table_name}: {e}")
                # Rollback and exit cleanly to prevent half-baked execution
                await db.rollback()
                raise e

        # Commit transaction explicitly encompassing ALL archived tables.
        logger.info("Committing main transaction...")
        await db.commit()
    
    logger.info("Soft Delete Archiving completed successfully.")


if __name__ == "__main__":
    asyncio.run(archive_soft_deletes())
