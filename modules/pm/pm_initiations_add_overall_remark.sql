-- =====================================================================
-- RUMBU INDUSTRIES GROUP — PM Checklist: overall job remark
-- Run this once in the Supabase SQL editor, AFTER pm_initiate_schema.sql.
--
-- Adds a single free-text field on the JOB itself (pm_initiations), for
-- one overall remark about that PM visit as a whole — separate from the
-- per-item "Quantity" field on pm_initiation_items, which stays scoped
-- to one checklist line each.
-- =====================================================================

alter table public.pm_initiations
  add column if not exists overall_remark text;
