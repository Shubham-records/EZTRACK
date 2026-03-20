"""SW-08: Add trigger-maintained status_computed column to Member.

Revision ID: 005_member_status_column
Revises: 004_rls_policies
Create Date: 2026-03-20

Why a trigger and NOT GENERATED ALWAYS AS:
    PostgreSQL GENERATED columns require IMMUTABLE expressions.
    CURRENT_DATE is STABLE (changes daily), so 'GENERATED ALWAYS AS
    (CASE WHEN NextDuedate >= CURRENT_DATE ...)' is rejected with:
        ERROR: generation expression is not immutable

    A trigger-maintained column gives us the same benefits (stored,
    indexable) without the IMMUTABLE restriction.  The trigger fires
    on INSERT/UPDATE of NextDuedate and recomputes the status.

    A nightly SQL function (`refresh_member_status_computed`) is also
    provided to batch-update rows whose status transitions from
    Active→Expired at midnight.  Schedule it via pg_cron or an
    external cron job:
        SELECT refresh_member_status_computed();

Performance impact (10K members per gym):
    Before: CASE expression evaluated per-row during every SELECT
    After:  Index scan on (gymId, status_computed) WHERE isDeleted = false
    Expected speedup: 5–20x for status-filtered dashboard/list queries.
"""

from alembic import op


revision = "005_member_status_column"
down_revision = "004_rls_policies"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── 1. Add the column ─────────────────────────────────────────────────────
    op.execute("""
        ALTER TABLE "Member"
        ADD COLUMN IF NOT EXISTS status_computed VARCHAR(10)
            DEFAULT 'Inactive';
    """)

    # ── 2. Backfill existing rows ─────────────────────────────────────────────
    op.execute("""
        UPDATE "Member"
        SET status_computed = CASE
            WHEN "NextDuedate" IS NULL THEN 'Inactive'
            WHEN "NextDuedate" >= CURRENT_DATE THEN 'Active'
            ELSE 'Expired'
        END;
    """)

    # ── 3. Trigger function: recompute on every INSERT/UPDATE ─────────────────
    op.execute("""
        CREATE OR REPLACE FUNCTION trg_member_status_computed()
        RETURNS trigger AS $$
        BEGIN
            NEW.status_computed := CASE
                WHEN NEW."NextDuedate" IS NULL THEN 'Inactive'
                WHEN NEW."NextDuedate" >= CURRENT_DATE THEN 'Active'
                ELSE 'Expired'
            END;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
    """)

    op.execute("""
        DROP TRIGGER IF EXISTS trg_member_status_computed ON "Member";
        CREATE TRIGGER trg_member_status_computed
            BEFORE INSERT OR UPDATE OF "NextDuedate"
            ON "Member"
            FOR EACH ROW
            EXECUTE FUNCTION trg_member_status_computed();
    """)

    # ── 4. Nightly maintenance function ───────────────────────────────────────
    # Call via pg_cron or external cron: SELECT refresh_member_status_computed();
    op.execute("""
        CREATE OR REPLACE FUNCTION refresh_member_status_computed()
        RETURNS integer AS $$
        DECLARE
            updated_count integer;
        BEGIN
            UPDATE "Member"
            SET status_computed = 'Expired'
            WHERE status_computed = 'Active'
              AND "NextDuedate" < CURRENT_DATE
              AND "isDeleted" = false;
            GET DIAGNOSTICS updated_count = ROW_COUNT;
            RETURN updated_count;
        END;
        $$ LANGUAGE plpgsql;
    """)

    # ── 5. Index on the new stored column ─────────────────────────────────────
    op.execute("""
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'Member'
              AND indexname  = 'ix_member_gym_status_computed'
          ) THEN
            CREATE INDEX CONCURRENTLY ix_member_gym_status_computed
              ON "Member" ("gymId", status_computed)
              WHERE "isDeleted" = false;
          END IF;
        END $$;
    """)


def downgrade() -> None:
    op.execute('DROP TRIGGER IF EXISTS trg_member_status_computed ON "Member";')
    op.execute("DROP FUNCTION IF EXISTS trg_member_status_computed();")
    op.execute("DROP FUNCTION IF EXISTS refresh_member_status_computed();")
    op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_member_gym_status_computed;")
    op.execute('ALTER TABLE "Member" DROP COLUMN IF EXISTS status_computed;')
