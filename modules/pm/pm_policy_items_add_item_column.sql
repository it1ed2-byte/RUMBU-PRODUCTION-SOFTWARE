-- =====================================================================
-- RUMBU INDUSTRIES GROUP — PM Checklist: add "Item" column
-- Run this once in the Supabase SQL editor, AFTER pm_checklist_schema.sql.
--
-- Splits the checklist line into two fields, matching the reference
-- Excel layout: a short ITEM label plus a longer DESCRIPTION. The
-- existing "checklist_item" column becomes the Description field (no
-- rename, no data migration needed — only its on-screen label changes,
-- in Add Policy and View Policies). item_name is the new Item field.
--
-- Optional by design: existing rows keep item_name = null and simply
-- show as blank in the Item column. Not made NOT NULL, so nothing
-- already saved breaks.
-- =====================================================================

alter table public.pm_policy_items
  add column if not exists item_name text;
