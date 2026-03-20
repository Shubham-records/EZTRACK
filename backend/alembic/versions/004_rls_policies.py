"""SW-04: Implement Database-Level Row-Level Security (RLS) for multi-tenant isolation.

Revision ID: 004
Revises: 003
Create Date: 2026-03-20
"""
from alembic import op

# List of tables to enable RLS on. These are the primary "Data" tables.
# Metadata/Auth tables like Gym, User, RefreshToken are excluded to avoid 
# breaking the initial login/signup flows which perform cross-tenant lookups.
# Once authenticated, dependencies set app.current_gym_id to enforce 
# isolation on these data tables.
DATA_TABLES = [
    ("Member", "gymId"),
    ("Invoice", "gymId"),
    ("PaymentEvent", "gymId"),
    ("ProteinStock", "gymId"),
    ("ProteinLot", "gymId"),
    ("GymDailySummary", "gymId"),
    ("GymSettings", "gymId"),
    ("Expense", "gymId"),
    ("ExternalContact", "gymId"),
    ("PricingConfig", "gymId"),
    ("AuditLog", "gymId"),
    ("TermsAndConditions", "gymId"),
    ("WhatsAppTemplate", "gymId"),
    ("SoftDeleteArchive", "gymId"),
    ("Branch", "gymId"),
    ("GymSubscription", "gymId"),
]

def upgrade():
    for table_name, column_name in DATA_TABLES:
        # 1. Enable RLS
        op.execute(f'ALTER TABLE "{table_name}" ENABLE ROW LEVEL SECURITY;')
        
        # 2. Force RLS (defense-in-depth: ensures it's applied even for the table owner)
        op.execute(f'ALTER TABLE "{table_name}" FORCE ROW LEVEL SECURITY;')

        # 3. Create the tenant isolation policy
        # current_setting('app.current_gym_id', true) returns NULL if not set.
        # This blocks ALL access unless the session variable is explicitly set
        # by the application dependencies or auth handlers.
        op.execute(f"""
            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_policies 
                    WHERE tablename = '{table_name}' AND policyname = 'gym_isolation'
                ) THEN
                    CREATE POLICY gym_isolation ON "{table_name}"
                    USING ("{column_name}"::text = current_setting('app.current_gym_id', true));
                END IF;
            END $$;
        """)

def downgrade():
    for table_name, _ in DATA_TABLES:
        op.execute(f'DROP POLICY IF EXISTS gym_isolation ON "{table_name}";')
        op.execute(f'ALTER TABLE "{table_name}" DISABLE ROW LEVEL SECURITY;')
        op.execute(f'ALTER TABLE "{table_name}" NO FORCE ROW LEVEL SECURITY;')
