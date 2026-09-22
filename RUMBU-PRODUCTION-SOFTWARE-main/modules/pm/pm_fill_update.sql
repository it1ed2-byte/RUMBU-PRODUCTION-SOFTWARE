-- =====================================================================
-- RUMBU INDUSTRIES GROUP — PM Checklist: record who filled a checklist
-- Run this ONLY if you already ran pm_initiate_schema.sql before this
-- update (it adds the filled_by column that the newer schema now
-- includes). Safe to run more than once.
-- =====================================================================

alter table public.pm_initiations
  add column if not exists filled_by text;  -- username of whoever submitted the checklist
