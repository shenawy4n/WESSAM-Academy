-- ==============================================================================
-- WESSAM Academy — Migration 10: Minimize Group Archive Authorization Privileges
-- Version: 20261104000004
--
-- Objective:
-- Enforce the principle of least privilege on public.group_archive_authorizations.
-- 1. Revoke all direct privileges on public.group_archive_authorizations from service_role.
--    The archiving and restoration paths execute via SECURITY DEFINER functions
--    owned by the database administrator (postgres). Neither service_role nor any
--    application role requires direct table permissions on this internal authorization table.
-- 2. Confirm object ownership (table and security functions owned by postgres).
-- 3. Confirm default-deny RLS configuration with zero permissive policies.
-- 4. Maintain strict execution privileges for RPCs while forbidding direct table manipulation.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. REVOKE DIRECT TABLE PRIVILEGES FROM service_role, anon, authenticated, PUBLIC
-- ------------------------------------------------------------------------------
REVOKE ALL ON TABLE public.group_archive_authorizations FROM service_role;
REVOKE ALL ON TABLE public.group_archive_authorizations FROM authenticated;
REVOKE ALL ON TABLE public.group_archive_authorizations FROM anon;
REVOKE ALL ON TABLE public.group_archive_authorizations FROM PUBLIC;

-- ------------------------------------------------------------------------------
-- 2. ENSURE TRUSTED OWNER HAS EXCLUSIVE ACCESS
-- ------------------------------------------------------------------------------
-- Ensure the internal authorization table is owned by the trusted superuser/admin role (postgres)
ALTER TABLE public.group_archive_authorizations OWNER TO postgres;
GRANT ALL ON TABLE public.group_archive_authorizations TO postgres;

-- Ensure SECURITY DEFINER functions are owned by postgres so they execute with owner privileges
ALTER FUNCTION public.enforce_group_archive_metadata_protection() OWNER TO postgres;
ALTER FUNCTION public.archive_group(UUID, TEXT) OWNER TO postgres;
ALTER FUNCTION public.restore_group(UUID) OWNER TO postgres;

-- ------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY DEFENSE-IN-DEPTH
-- ------------------------------------------------------------------------------
ALTER TABLE public.group_archive_authorizations ENABLE ROW LEVEL SECURITY;
-- Explicitly drop any legacy or accidental policies to guarantee zero user access
DROP POLICY IF EXISTS "Deny all user access to group_archive_authorizations" ON public.group_archive_authorizations;

-- ------------------------------------------------------------------------------
-- 4. RE-VERIFY FUNCTION PRIVILEGES (LEAST PRIVILEGE)
-- ------------------------------------------------------------------------------
-- The trigger function must be executable by updating roles so Postgres can invoke it,
-- but returns trigger and cannot be called directly via SELECT/RPC.
REVOKE ALL ON FUNCTION public.enforce_group_archive_metadata_protection() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.enforce_group_archive_metadata_protection() FROM anon;
GRANT EXECUTE ON FUNCTION public.enforce_group_archive_metadata_protection() TO authenticated, service_role;

-- Archive RPC (Super Admin only, checked internally via is_super_admin)
REVOKE ALL ON FUNCTION public.archive_group(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_group(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_group(UUID, TEXT) TO authenticated, service_role;

-- Restore RPC (Super Admin only, checked internally via is_super_admin)
REVOKE ALL ON FUNCTION public.restore_group(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.restore_group(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.restore_group(UUID) TO authenticated, service_role;

-- provision_student_tx remains exclusively service_role
REVOKE ALL ON FUNCTION public.provision_student_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provision_student_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID) FROM authenticated;
REVOKE ALL ON FUNCTION public.provision_student_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.provision_student_tx(UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID, TEXT, UUID) TO service_role;
