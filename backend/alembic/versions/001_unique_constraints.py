"""SCH-03 + SCH-04: Add UNIQUE constraints to Gym.username and User(gymId, username).

Revision ID: 001_unique_constraints
Revises:
Create Date: 2026-03-18

Context
-------
SCH-03: Gym.username already has unique=True in the ORM model, but unless this
        was reflected in a previous migration, the DB column may lack the
        UNIQUE index entirely.  This migration ensures the constraint exists.

SCH-04: User(gymId, username) uniqueness is enforced by a unique index
        'uq_user_gym_username' in the ORM model.  Without this migration the
        DB may accept two staff users with the same username in the same gym
        (the Python-level duplicate check has a TOCTOU race window).

        Note: The old 'ix_user_gym_id' performance index on User.gymId is also
        created here if absent.

Both ops use IF NOT EXISTS / try-except so the migration is safe to re-run.
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers used by Alembic
revision = "001_unique_constraints"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # ── SCH-03: Gym.username UNIQUE ───────────────────────────────────────────
    # The column was created with unique=True in the ORM, but we make the index
    # explicit so it appears in alembic history and is easy to drop/inspect.
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'Gym'
              AND indexname  = 'uq_gym_username'
          ) THEN
            CREATE UNIQUE INDEX uq_gym_username ON "Gym" (username);
          END IF;
        END $$;
        """
    )

    # ── SCH-04: User(gymId, username) composite UNIQUE ────────────────────────
    # Prevents two staff members sharing the same username within one gym.
    # Closes a TOCTOU race: concurrent POST /staff calls can both pass the
    # Python duplicate-check before either commits — the DB constraint is the
    # last line of defence.
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'User'
              AND indexname  = 'uq_user_gym_username'
          ) THEN
            CREATE UNIQUE INDEX uq_user_gym_username ON "User" ("gymId", username);
          END IF;
        END $$;
        """
    )

    # ── Performance index on User.gymId (non-unique) ──────────────────────────
    op.execute(
        """
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_indexes
            WHERE tablename = 'User'
              AND indexname  = 'ix_user_gym_id'
          ) THEN
            CREATE INDEX ix_user_gym_id ON "User" ("gymId");
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute('DROP INDEX IF EXISTS "uq_gym_username";')
    op.execute('DROP INDEX IF EXISTS "uq_user_gym_username";')
    op.execute('DROP INDEX IF EXISTS "ix_user_gym_id";')
