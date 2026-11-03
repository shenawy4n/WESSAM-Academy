-- ==============================================================================
-- WESSAM Academy — Migration A: Introduce Super Admin Role
-- Version: 20261103000002
-- 
-- IMPORTANT: In PostgreSQL, ALTER TYPE ... ADD VALUE cannot be referenced in the 
-- same transaction where it is introduced. This dedicated migration adds 'super_admin'
-- to user_role_enum so it is committed before subsequent migrations reference it.
-- ==============================================================================

DO $$ BEGIN
    ALTER TYPE user_role_enum ADD VALUE IF NOT EXISTS 'super_admin' BEFORE 'teacher';
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;
