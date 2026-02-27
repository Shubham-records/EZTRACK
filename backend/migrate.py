"""
migrate.py  —  Clean-slate DB migration + post-schema DB objects
=================================================================
Usage:
    source venv/bin/activate
    python migrate.py

What this does:
1. Drops ALL tables in the public schema (safe — no production data).
2. Recreates every table from the current SQLAlchemy models.
3. Installs PostgreSQL triggers and rules that cannot be expressed in SQLAlchemy:
   - ARCH-07: ProteinStock.Quantity auto-sync trigger (stays in sync with SUM of lots)
   - SEC-12:  Gym hard-delete prevention rule at PostgreSQL level (belt-and-suspenders with ORM event)
   - SCH-04:  Invoice.items JSON schema validation trigger (rejects malformed line items)
   - SCH-05:  User.branchIds FK validation trigger (rejects branch IDs not in Branch table)

After the first production deploy with real data, use Alembic instead:
    alembic revision --autogenerate -m "describe_change"
    alembic upgrade head
"""

import sys
from sqlalchemy import text

# ── Bootstrap ──────────────────────────────────────────────────────────────────
try:
    from core.database import engine, Base
    import models.all_models  # noqa: F401  — registers all ORM models with Base
except Exception as exc:
    print(f"❌  Cannot import project modules: {exc}")
    print("    Make sure you activated the virtualenv and are in the backend/ directory.")
    sys.exit(1)


# ─── SQL for DB-level objects ─────────────────────────────────────────────────

# ARCH-07: Auto-sync ProteinStock.Quantity = SUM of all its ProteinLot.quantity values.
# Fires on every INSERT / UPDATE / DELETE on ProteinLot.
# This eliminates the desync bug where ProteinStock.Quantity drifted from actual lots.
TRIGGER_PROTEIN_QUANTITY_SYNC = """
CREATE OR REPLACE FUNCTION sync_protein_stock_quantity()
RETURNS TRIGGER AS $$
DECLARE
    target_protein_id TEXT;
    new_quantity INTEGER;
BEGIN
    -- Determine which ProteinStock to update
    IF TG_OP = 'DELETE' THEN
        target_protein_id := OLD."proteinId";
    ELSE
        target_protein_id := NEW."proteinId";
    END IF;

    -- Recompute from all remaining lots
    SELECT COALESCE(SUM(quantity), 0)
      INTO new_quantity
      FROM "ProteinLot"
     WHERE "proteinId" = target_protein_id;

    UPDATE "ProteinStock"
       SET "Quantity" = new_quantity,
           "updatedAt" = NOW()
     WHERE id = target_protein_id;

    -- If this was a lot transfer (UPDATE changed proteinId), also sync old protein
    IF TG_OP = 'UPDATE' AND OLD."proteinId" <> NEW."proteinId" THEN
        SELECT COALESCE(SUM(quantity), 0)
          INTO new_quantity
          FROM "ProteinLot"
         WHERE "proteinId" = OLD."proteinId";

        UPDATE "ProteinStock"
           SET "Quantity" = new_quantity,
               "updatedAt" = NOW()
         WHERE id = OLD."proteinId";
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_protein_quantity ON "ProteinLot";
CREATE TRIGGER trg_sync_protein_quantity
    AFTER INSERT OR UPDATE OR DELETE ON "ProteinLot"
    FOR EACH ROW
    EXECUTE FUNCTION sync_protein_stock_quantity();
"""

# SEC-12: Prevent hard-delete of Gym rows at PostgreSQL level.
# Belt-and-suspenders: the ORM also has a before_delete listener, but raw SQL
# (e.g., from a migration script or direct psql) bypasses the ORM.
# Use pg rule instead of trigger so it fires before the DELETE reaches storage.
GYM_HARD_DELETE_RULE = """
DROP RULE IF EXISTS prevent_gym_hard_delete ON "Gym";
CREATE OR REPLACE RULE prevent_gym_hard_delete AS
    ON DELETE TO "Gym"
    DO INSTEAD NOTHING;
"""

# NOTE: The above rule completely blocks DELETE. To actually remove a gym during
# development, DROP the rule first:
#   DROP RULE prevent_gym_hard_delete ON "Gym";
# In production, use: UPDATE "Gym" SET "isDeleted"=TRUE, "deletedAt"=NOW() WHERE id=?

# SCH-04: Invoice.items JSON validation.
# Enforces that every item in the array has: description (text), quantity (number),
# rate (number), amount (number). Rejects NULL or wrong-type values at INSERT/UPDATE.
TRIGGER_INVOICE_ITEMS_VALIDATION = """
CREATE OR REPLACE FUNCTION validate_invoice_items()
RETURNS TRIGGER AS $$
DECLARE
    item  JSONB;
    items JSONB;
BEGIN
    items := NEW.items;

    -- Must be a JSON array
    IF jsonb_typeof(items) <> 'array' THEN
        RAISE EXCEPTION 'Invoice.items must be a JSON array, got: %', jsonb_typeof(items);
    END IF;

    -- Each element must have required fields with correct types
    FOR item IN SELECT * FROM jsonb_array_elements(items)
    LOOP
        IF item->>'description' IS NULL THEN
            RAISE EXCEPTION 'Invoice item missing required field: description';
        END IF;

        IF (item->>'quantity') IS NULL OR jsonb_typeof(item->'quantity') NOT IN ('number') THEN
            RAISE EXCEPTION 'Invoice item "quantity" must be a number, got: %', item->>'quantity';
        END IF;

        IF (item->>'rate') IS NULL OR jsonb_typeof(item->'rate') NOT IN ('number') THEN
            RAISE EXCEPTION 'Invoice item "rate" must be a number, got: %', item->>'rate';
        END IF;

        IF (item->>'amount') IS NULL OR jsonb_typeof(item->'amount') NOT IN ('number') THEN
            RAISE EXCEPTION 'Invoice item "amount" must be a number, got: %', item->>'amount';
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_invoice_items ON "Invoice";
CREATE TRIGGER trg_validate_invoice_items
    BEFORE INSERT OR UPDATE ON "Invoice"
    FOR EACH ROW
    EXECUTE FUNCTION validate_invoice_items();
"""

# SCH-05: User.branchIds JSON FK validation.
# Ensures every branch ID in the JSON array actually exists in the Branch table
# AND belongs to the same gym, preventing orphaned cross-gym branch references.
TRIGGER_USER_BRANCH_IDS_VALIDATION = """
CREATE OR REPLACE FUNCTION validate_user_branch_ids()
RETURNS TRIGGER AS $$
DECLARE
    branch_id TEXT;
    branch_count INTEGER;
BEGIN
    -- NULL or empty array is fine (global access)
    IF NEW."branchIds" IS NULL OR jsonb_array_length(NEW."branchIds"::jsonb) = 0 THEN
        RETURN NEW;
    END IF;

    -- Check each branch ID exists AND belongs to the same gym
    FOR branch_id IN SELECT jsonb_array_elements_text(NEW."branchIds"::jsonb)
    LOOP
        SELECT COUNT(*) INTO branch_count
          FROM "Branch"
         WHERE id = branch_id
           AND "gymId" = NEW."gymId"
           AND "isActive" = TRUE;

        IF branch_count = 0 THEN
            RAISE EXCEPTION
                'User.branchIds contains invalid branch_id % (not found in gym % or inactive)',
                branch_id, NEW."gymId";
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_user_branch_ids ON "User";
CREATE TRIGGER trg_validate_user_branch_ids
    BEFORE INSERT OR UPDATE ON "User"
    FOR EACH ROW
    EXECUTE FUNCTION validate_user_branch_ids();
"""


# ─── Core migration functions ─────────────────────────────────────────────────

def drop_all_tables():
    """Drop every table in the public schema using CASCADE."""
    print("⚠️  Dropping all existing tables …")
    with engine.connect() as conn:
        conn.execute(text("SET session_replication_role = replica;"))
        result = conn.execute(text("""
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            ORDER BY tablename;
        """))
        tables = [row[0] for row in result]

        if not tables:
            print("   No tables found — database is already clean.")
            conn.execute(text("SET session_replication_role = DEFAULT;"))
            conn.commit()
            return

        for table in tables:
            print(f"   Dropping: {table}")
            conn.execute(text(f'DROP TABLE IF EXISTS "{table}" CASCADE;'))

        conn.execute(text("SET session_replication_role = DEFAULT;"))
        conn.commit()
    print(f"   ✅ Dropped {len(tables)} tables.\n")


def create_all_tables():
    """Create all tables from the current ORM models."""
    print("🔨  Creating tables from current models …")
    Base.metadata.create_all(bind=engine)
    print("   ✅ All tables created.\n")


def install_db_objects():
    """
    Install PostgreSQL triggers, functions, and rules.
    These enforce constraints that SQLAlchemy column definitions cannot express.
    """
    print("⚙️  Installing DB-level triggers and rules …")

    objects = [
        ("ARCH-07  ProteinStock.Quantity auto-sync trigger",   TRIGGER_PROTEIN_QUANTITY_SYNC),
        ("SEC-12   Gym hard-delete prevention rule",           GYM_HARD_DELETE_RULE),
        ("SCH-04   Invoice.items JSON schema validation",      TRIGGER_INVOICE_ITEMS_VALIDATION),
        ("SCH-05   User.branchIds FK validation trigger",      TRIGGER_USER_BRANCH_IDS_VALIDATION),
    ]

    with engine.connect() as conn:
        for label, sql in objects:
            try:
                # Execute each multi-statement block as a single transaction
                conn.execute(text(sql))
                conn.commit()
                print(f"   ✅ {label}")
            except Exception as exc:
                conn.rollback()
                print(f"   ❌ {label}")
                print(f"      Error: {exc}")

    print()


def verify_tables():
    """Print a list of created tables and their column counts for verification."""
    print("🔍  Verifying created tables:")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT
                t.tablename,
                COUNT(c.column_name) AS col_count
            FROM pg_tables t
            JOIN information_schema.columns c
                ON c.table_name = t.tablename AND c.table_schema = 'public'
            WHERE t.schemaname = 'public'
            GROUP BY t.tablename
            ORDER BY t.tablename;
        """))
        rows = result.fetchall()
        for row in rows:
            print(f"   ✅ {row[0]:<35} ({row[1]} columns)")

    print()

    print("🔍  Verifying installed triggers:")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT trigger_name, event_object_table, event_manipulation
            FROM information_schema.triggers
            WHERE trigger_schema = 'public'
            ORDER BY event_object_table, trigger_name;
        """))
        triggers = result.fetchall()
        for t in triggers:
            print(f"   ✅ {t[0]:<45} on {t[1]} ({t[2]})")
        if not triggers:
            print("   ⚠️  No triggers found.")

    print(f"\n   Total tables: {len(rows)}, Triggers: {len(triggers)}")


if __name__ == "__main__":
    print("=" * 60)
    print("  EZTRACK — Clean-Slate DB Migration")
    print("=" * 60)
    print()

    drop_all_tables()
    create_all_tables()
    install_db_objects()
    verify_tables()

    print()
    print("=" * 60)
    print("  Migration complete.")
    print("=" * 60)
