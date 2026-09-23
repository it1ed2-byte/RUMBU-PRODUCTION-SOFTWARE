-- =====================================================================
-- RUMBU INDUSTRIES GROUP — PM Checklist: Archive + Edit support
-- Run this once in the Supabase SQL editor, AFTER pm_checklist_schema.sql.
-- Adds an "archived" flag to pm_policies (used by the new Archive /
-- Unarchive button on View Policies) plus lightweight edit-tracking
-- columns (used by the new Edit button, Super Admin only).
--
-- Archiving is a soft, reversible action — it does NOT delete anything.
-- Existing pm_initiations rows already carry a frozen snapshot of the
-- policy (policy_number, policy_name, unit_name, section, pm_next_days),
-- so archiving a policy never changes historical PM job records; it only
-- removes it from the active list on View Policies and from the
-- dropdown on Initiate Policy.
-- =====================================================================

alter table public.pm_policies
  add column if not exists archived     boolean not null default false,
  add column if not exists archived_at  timestamptz,
  add column if not exists archived_by  text,          -- username who archived/unarchived last
  add column if not exists updated_at   timestamptz,
  add column if not exists updated_by   text;           -- username who last saved an edit

create index if not exists idx_pm_policies_archived on public.pm_policies (archived);
