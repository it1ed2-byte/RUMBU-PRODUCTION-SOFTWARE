-- =====================================================================
-- RUMBU INDUSTRIES GROUP — PM Checklist module
-- Run this once in the Supabase SQL editor.
-- Creates two tables (policies + their checklist items), opens the same
-- read/write policy style used elsewhere in the app, and registers the
-- module + its two pages so they appear in the sidebar, Branch Modules
-- and Manage Role (assignable per person, per branch) automatically.
-- =====================================================================

-- 1) A PM policy: one per (unit + policy number). ----------------------
create table if not exists public.pm_policies (
  id             bigint generated always as identity primary key,
  policy_number  text not null,
  policy_name    text not null,
  unit_id        bigint references public.units(id),
  unit_name      text,                    -- denormalised for easy reporting
  department_id  bigint,                  -- the Technical department the unit sits under
  section        text,                    -- branch (app_sections.name) of that department
  pm_next_days   integer not null check (pm_next_days > 0),
  created_by     text,                    -- username of the signed-in creator
  description    text,
  created_at     timestamptz not null default now(),
  unique (policy_number)
);
create index if not exists idx_pm_policies_unit on public.pm_policies (unit_id);

-- 2) The checklist items that belong to a policy. ----------------------
create table if not exists public.pm_policy_items (
  id             bigint generated always as identity primary key,
  policy_id      bigint not null references public.pm_policies(id) on delete cascade,
  item_no        integer not null,
  checklist_item text not null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_pm_policy_items_policy on public.pm_policy_items (policy_id);

-- 3) Row Level Security — same permissive style as the other app tables.
--    (Read: anyone; write: any signed-in user. Who can actually reach
--    the pages is controlled by page assignment, not by RLS here.)
alter table public.pm_policies      enable row level security;
alter table public.pm_policy_items  enable row level security;

drop policy if exists "read_pm_policies" on public.pm_policies;
create policy "read_pm_policies" on public.pm_policies for select to anon, authenticated using (true);
drop policy if exists "write_pm_policies" on public.pm_policies;
create policy "write_pm_policies" on public.pm_policies for insert to authenticated with check (true);
drop policy if exists "update_pm_policies" on public.pm_policies;
create policy "update_pm_policies" on public.pm_policies for update to authenticated using (true) with check (true);
drop policy if exists "delete_pm_policies" on public.pm_policies;
create policy "delete_pm_policies" on public.pm_policies for delete to authenticated using (true);

drop policy if exists "read_pm_policy_items" on public.pm_policy_items;
create policy "read_pm_policy_items" on public.pm_policy_items for select to anon, authenticated using (true);
drop policy if exists "write_pm_policy_items" on public.pm_policy_items;
create policy "write_pm_policy_items" on public.pm_policy_items for insert to authenticated with check (true);
drop policy if exists "update_pm_policy_items" on public.pm_policy_items;
create policy "update_pm_policy_items" on public.pm_policy_items for update to authenticated using (true) with check (true);
drop policy if exists "delete_pm_policy_items" on public.pm_policy_items;
create policy "delete_pm_policy_items" on public.pm_policy_items for delete to authenticated using (true);

-- 4) Register the module + its two pages (sidebar / Branch Modules / Role).
insert into public.modules (name, sort_order)
select 'PM Checklist', coalesce(max(sort_order), 0) + 1 from public.modules
where not exists (select 1 from public.modules where name = 'PM Checklist');

insert into public.pages (name, module_id, module_path)
select 'Add Policy', m.id, 'pm/add-policy'
from public.modules m
where m.name = 'PM Checklist'
  and not exists (select 1 from public.pages where module_path = 'pm/add-policy');

insert into public.pages (name, module_id, module_path)
select 'View Policy', m.id, 'pm/view-policy'
from public.modules m
where m.name = 'PM Checklist'
  and not exists (select 1 from public.pages where module_path = 'pm/view-policy');

-- 5) OPTIONAL — make both pages available in EVERY branch straight away.
--    Skip this block if you would rather tick the branches by hand in
--    Manage Accounts -> Branch Modules.
insert into public.page_sections (section_id, page_id)
select s.id, p.id
from public.app_sections s
cross join public.pages p
where p.module_path in ('pm/add-policy', 'pm/view-policy')
  and not exists (
    select 1 from public.page_sections ps
    where ps.section_id = s.id and ps.page_id = p.id
  );
