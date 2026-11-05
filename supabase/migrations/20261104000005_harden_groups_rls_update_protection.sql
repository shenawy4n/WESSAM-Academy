-- ==============================================================================
-- WESSAM Academy — Migration 11: Harden Groups RLS Update Protection
-- Version: 20261104000005
--
-- Objective:
-- Ensure that direct UPDATE attempts on public.groups by unauthorized callers
-- (such as students) are actively evaluated against the archive metadata
-- protection trigger and RLS WITH CHECK constraint, rather than silently
-- being filtered out by RLS USING clause.
--
-- Security Guarantees:
-- 1. Active students or teachers can select rows for the update statement,
--    ensuring the BEFORE UPDATE trigger trg_protect_group_archive_metadata
--    executes on any archive metadata modification attempt and raises SQLSTATE 42501.
-- 2. Non-archive updates by non-teachers (students) are strictly rejected by the
--    WITH CHECK (public.is_teacher()) clause with SQLSTATE 42501.
-- 3. Teachers retain full authorized permissions to update ordinary group fields
--    (name, description, max_students, etc.).
-- 4. Direct deletion remains strictly blocked by existing restrictive policy.
-- ==============================================================================

DROP POLICY IF EXISTS "Teachers update groups" ON public.groups;

CREATE POLICY "Teachers update groups" ON public.groups
    FOR UPDATE
    USING (public.is_teacher() OR public.is_active_student())
    WITH CHECK (public.is_teacher());
