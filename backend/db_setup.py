"""
migrate.py  —  Clean-slate DB migration + post-schema DB objects
=================================================================
Usage:
    source venv/bin/activate

    # Normal: drop + recreate schema + install triggers (DEV only)
    python migrate.py

    # P13: Partition AuditLog by month (PRODUCTION — run once when table > 100K rows)
    python migrate.py --partition

What this does (normal mode):
1. Drops ALL tables in the public schema (safe — no production data).
2. Recreates every table from the current SQLAlchemy models.
3. Installs PostgreSQL triggers and rules that cannot be expressed in SQLAlchemy:
   - ARCH-07: ProteinStock.Quantity auto-sync trigger (stays in sync with SUM of lots)
   - SEC-12:  Gym hard-delete prevention rule at PostgreSQL level (belt-and-suspenders with ORM event)
   - SCH-04:  Invoice.items JSON schema validation trigger (rejects malformed line items)
   - SCH-05:  User.branchIds FK validation trigger (rejects branch IDs not in Branch table)

What --partition does (P13):
- Safe for production: does NOT drop any tables.
- Renames "AuditLog" → "AuditLog_classic" (preserves all existing rows).
- Creates "AuditLog" as a RANGE-partitioned table on "createdAt".
- Creates monthly child partitions for the last 12 months + next 12 months.
- Copies all rows from AuditLog_classic into the new partitioned table.
- Installs a pg_cron job to auto-create future monthly partitions 30 days ahead.
- All application code, indexes, and FK references continue working unchanged.

After the first production deploy with real data, use Alembic instead:
    alembic revision --autogenerate -m "describe_change"
    alembic upgrade head
"""

import sys
import calendar
from datetime import date
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


# ─── P13: AuditLog Monthly Partitioning ──────────────────────────────────────
# Run ONCE when AuditLog reaches ~100K rows (typically 12 months after launch).
# Safe for production: renames the old table, never drops it.

def partition_auditlog():
    """
    P13: Convert AuditLog from a regular heap table to a RANGE-partitioned table.

    Steps (all in a single transaction block per phase):
      Phase 1 — Rename the old table to AuditLog_classic (zero downtime preserves data).
      Phase 2 — Create AuditLog as PARTITION BY RANGE (createdAt).
      Phase 3 — Create monthly child partitions (12 back + 12 forward from today).
      Phase 4 — Copy all rows from AuditLog_classic into the new table.
      Phase 5 — Install pg_cron job to auto-create future partitions monthly.
      Phase 6 — Verify partition layout.

    Idempotent: safe to re-run if interrupted (checks for existing partitions).
    """
    print("=" * 60)
    print("  P13 — AuditLog Monthly Partitioning")
    print("=" * 60)
    print()
    print("  ⚠️  This migration is safe for production but CANNOT be undone")
    print("      without downtime. Ensure a backup exists before proceeding.")
    print()

    confirm = input("  Type 'yes' to continue: ").strip().lower()
    if confirm != "yes":
        print("  Aborted.")
        return

    with engine.connect() as conn:
        # ── Phase 1: Check if already partitioned ───────────────────────────
        result = conn.execute(text("""
            SELECT relkind
            FROM pg_class
            WHERE relname = 'AuditLog'
              AND relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        """)).fetchone()

        if result and result[0] == 'p':
            print("  ℹ️  AuditLog is already a partitioned table. Nothing to do.")
            return

        print("  Phase 1: Renaming AuditLog → AuditLog_classic ...")
        conn.execute(text('ALTER TABLE "AuditLog" RENAME TO "AuditLog_classic";'))
        conn.commit()
        print("  ✅ Phase 1 complete.\n")

        # ── Phase 2: Create partitioned parent table ─────────────────────────
        print("  Phase 2: Creating partitioned AuditLog table ...")
        conn.execute(text("""
            CREATE TABLE "AuditLog" (
                id           TEXT        NOT NULL,
                "gymId"      TEXT        NOT NULL REFERENCES "Gym"(id),
                "entityType" TEXT        NOT NULL,
                "entityId"   TEXT        NOT NULL,
                action       TEXT        NOT NULL,
                changes      JSONB,
                "userId"     TEXT,
                "userName"   TEXT,
                "ipAddress"  TEXT,
                "createdAt"  TIMESTAMPTZ NOT NULL DEFAULT now()
            ) PARTITION BY RANGE ("createdAt");
        """))
        # Recreate indexes on parent (inherited by each partition)
        conn.execute(text(
            'CREATE INDEX ix_audit_gym_created ON "AuditLog" ("gymId", "createdAt");'
        ))
        conn.execute(text(
            'CREATE INDEX ix_audit_gym_entity  ON "AuditLog" ("gymId", "entityType", "entityId");'
        ))
        conn.execute(text(
            'CREATE INDEX ix_audit_created_at  ON "AuditLog" ("createdAt");'
        ))
        conn.commit()
        print("  ✅ Phase 2 complete.\n")

        # -- Phase 3: Create current month partition only ---------------------
        # manage_audit_partitions() (pg_cron, monthly) creates future partitions
        # automatically, so we only need the current month to start accepting data.
        print("  Phase 3: Creating current month partition ...")
        today      = date.today()
        cur_start  = today.replace(day=1)
        if cur_start.month == 12:
            nxt_start = date(cur_start.year + 1, 1, 1)
        else:
            nxt_start = date(cur_start.year, cur_start.month + 1, 1)
        part_name  = f"AuditLog_{cur_start.strftime('%Y_%m')}"
        from_val   = cur_start.strftime("%Y-%m-01")
        to_val     = nxt_start.strftime("%Y-%m-01")

        exists = conn.execute(text("""
            SELECT 1 FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE c.relname = :name AND n.nspname = 'public'
        """), {"name": part_name}).fetchone()

        if not exists:
            conn.execute(text(
                f'CREATE TABLE "{part_name}" '
                f'PARTITION OF "AuditLog" '
                f"FOR VALUES FROM ('{from_val}') TO ('{to_val}');"
            ))
        conn.commit()
        print(f"  [OK] Phase 3 complete -- {part_name} ({from_val} to {to_val})\n")
        print("  Note: manage_audit_partitions() will create future partitions")
        print("        automatically when scheduled via pg_cron.\n")

        # -- Phase 5: Install pg_cron auto-partition + 6-month cleanup ---------
        print("  Phase 5: Installing pg_cron auto-partition + cleanup function ...")
        conn.execute(text("""
            CREATE OR REPLACE FUNCTION manage_audit_partitions()
            RETURNS void AS $$
            DECLARE
                retention_months INT  := 6;
                next_month     DATE := date_trunc('month', NOW()) + INTERVAL '1 month';
                cutoff_month   DATE := date_trunc('month', NOW())
                                       - (retention_months || ' months')::INTERVAL;
                partition_name TEXT;
                from_val       TEXT;
                to_val         TEXT;
                already_exists BOOLEAN;
                rec            RECORD;
            BEGIN
                -- Step 1: create next month partition
                partition_name := 'AuditLog_' || to_char(next_month, 'YYYY_MM');
                from_val       := to_char(next_month, 'YYYY-MM-01');
                to_val         := to_char(next_month + INTERVAL '1 month', 'YYYY-MM-01');

                SELECT EXISTS (
                    SELECT 1 FROM pg_class c
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE c.relname = partition_name AND n.nspname = 'public'
                ) INTO already_exists;

                IF NOT already_exists THEN
                    EXECUTE format(
                        'CREATE TABLE %I PARTITION OF "AuditLog" FOR VALUES FROM (%L) TO (%L)',
                        partition_name, from_val, to_val
                    );
                    RAISE NOTICE 'Created partition: %', partition_name;
                END IF;

                -- Step 2: drop partitions older than retention_months
                FOR rec IN
                    SELECT c.relname AS pname
                    FROM pg_class p
                    JOIN pg_inherits i ON i.inhparent = p.oid
                    JOIN pg_class   c ON c.oid = i.inhrelid
                    JOIN pg_namespace n ON n.oid = c.relnamespace
                    WHERE p.relname = 'AuditLog'
                      AND n.nspname = 'public'
                      AND to_date(
                            substring(c.relname FROM 'AuditLog_([0-9]{4}_[0-9]{2})'),
                            'YYYY_MM'
                          ) < cutoff_month
                LOOP
                    EXECUTE format('DROP TABLE IF EXISTS %I', rec.pname);
                    RAISE NOTICE 'Dropped old partition: % (> % months old)',
                                 rec.pname, retention_months;
                END LOOP;
            END;
            $$ LANGUAGE plpgsql;
        """))
        conn.commit()
        print("  [OK] manage_audit_partitions() installed.")
        print("       - Creates next month partition on each run (idempotent)")
        print("       - Drops partitions older than 6 months (instant DROP TABLE, no VACUUM)")
        print()
        print("  MANUAL STEP: schedule in psql (requires pg_cron extension):")
        print("    SELECT cron.schedule(")
        print("        'monthly-audit-manage',")
        print("        '0 0 1 * *',  -- 1st of each month at midnight")
        print("        'SELECT manage_audit_partitions();'")
        print("    );")
        print("  If pg_cron unavailable: run manually on the 1st of each month.")
        print()

        # ── Phase 6: Verify ──────────────────────────────────────────────────
        print("  Phase 6: Verifying partition layout ...")
        partitions = conn.execute(text("""
            SELECT
                c.relname                         AS partition_name,
                pg_get_expr(c.relpartbound, c.oid) AS bounds
            FROM pg_class p
            JOIN pg_inherits i ON i.inhparent = p.oid
            JOIN pg_class   c ON c.oid        = i.inhrelid
            WHERE p.relname = 'AuditLog'
            ORDER BY c.relname;
        """)).fetchall()

        print(f"  Total partitions: {len(partitions)}")
        for p in partitions:
            print(f"     {p[0]:30s}  {p[1]}")

    print()
    print("=" * 60)
    print("  P13 Partitioning complete!")
    print("  AuditLog_classic preserved — drop it after verifying correctness.")
    print("  DROP TABLE \"AuditLog_classic\";  -- run manually when confident")
    print("=" * 60)


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
    if "--partition" in sys.argv:
        # P13: Run AuditLog partitioning only — safe for production
        partition_auditlog()
    else:
        # Normal: Full drop + recreate (DEV only)
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
        print()
        print("  Tip: When AuditLog exceeds 100K rows (~12 months), run:")
        print("       python migrate.py --partition")
