-- =====================================================================
-- RUMBU INDUSTRIES GROUP — PM Checklist module, part 2: Initiation
-- Run this AFTER pm_checklist_schema.sql (it needs pm_policies).
-- Adds the "initiate a PM job for a specialist" workflow:
--   * pm_initiations       — one PM job (policy + asset + specialist)
--   * pm_initiation_items  — a frozen copy of the policy's checklist,
--                            each line later marked Good / Bad + remark
-- and registers the two new pages (Initiate Policy, Fill Checklist).
-- =====================================================================

-- 1) A PM job assigned to one specialist. -----------------------------
create table if not exists public.pm_initiations (
  id                    bigint generated always as identity primary key,
  policy_id             bigint references public.pm_policies(id),
  policy_number         text,          -- snapshot at initiation time
  policy_name           text,
  unit_name             text,
  section               text,          -- branch
  asset                 text not null, -- free-text asset the PM is done on
  specialist_emp_pk     bigint references public.employees(id),  -- employees.id
  specialist_employee_id text,         -- the ID number typed on the form
  specialist_name       text,
  pm_next_days          integer,
  due_date              date,          -- initiated date + pm_next_days
  status                text not null default 'Pending' check (status in ('Pending','Completed')),
  initiated_by          text,
  initiated_at          timestamptz not null default now(),
  completed_at          timestamptz,
  filled_by             text          -- username of whoever filled/submitted the checklist
);
create index if not exists idx_pm_initiations_specialist on public.pm_initiations (specialist_emp_pk);
create index if not exists idx_pm_initiations_status on public.pm_initiations (status);

-- 2) Frozen checklist for that job; filled in by the specialist. -------
create table if not exists public.pm_initiation_items (
  id             bigint generated always as identity primary key,
  initiation_id  bigint not null references public.pm_initiations(id) on delete cascade,
  item_no        integer not null,
  checklist_item text not null,
  result         text check (result in ('Good','Bad')),  -- null until filled
  remark         text,
  created_at     timestamptz not null default now()
);
create index if not exists idx_pm_initiation_items_init on public.pm_initiation_items (initiation_id);

-- 3) RLS — same permissive style as the rest of the app. --------------
alter table public.pm_initiations      enable row level security;
alter table public.pm_initiation_items enable row level security;

drop policy if exists "read_pm_initiations" on public.pm_initiations;
create policy "read_pm_initiations" on public.pm_initiations for select to anon, authenticated using (true);
drop policy if exists "write_pm_initiations" on public.pm_initiations;
create policy "write_pm_initiations" on public.pm_initiations for insert to authenticated with check (true);
drop policy if exists "update_pm_initiations" on public.pm_initiations;
create policy "update_pm_initiations" on public.pm_initiations for update to authenticated using (true) with check (true);
drop policy if exists "delete_pm_initiations" on public.pm_initiations;
create policy "delete_pm_initiations" on public.pm_initiations for delete to authenticated using (true);

drop policy if exists "read_pm_initiation_items" on public.pm_initiation_items;
create policy "read_pm_initiation_items" on public.pm_initiation_items for select to anon, authenticated using (true);
drop policy if exists "write_pm_initiation_items" on public.pm_initiation_items;
create policy "write_pm_initiation_items" on public.pm_initiation_items for insert to authenticated with check (true);
drop policy if exists "update_pm_initiation_items" on public.pm_initiation_items;
create policy "update_pm_initiation_items" on public.pm_initiation_items for update to authenticated using (true) with check (true);
drop policy if exists "delete_pm_initiation_items" on public.pm_initiation_items;
create policy "delete_pm_initiation_items" on public.pm_initiation_items for delete to authenticated using (true);

-- 4) Register the two new pages under the existing PM Checklist module.
insert into public.pages (name, module_id, module_path)
select 'Initiate Policy', m.id, 'pm/initiate-policy'
from public.modules m
where m.name = 'PM Checklist'
  and not exists (select 1 from public.pages where module_path = 'pm/initiate-policy');

insert into public.pages (name, module_id, module_path)
select 'Fill Checklist', m.id, 'pm/fill-checklist'
from public.modules m
where m.name = 'PM Checklist'
  and not exists (select 1 from public.pages where module_path = 'pm/fill-checklist');

-- 5) OPTIONAL — make both new pages available in EVERY branch now.
--    Skip if you would rather tick them in Manage Accounts -> Branch Modules.
insert into public.page_sections (section_id, page_id)
select s.id, p.id
from public.app_sections s
cross join public.pages p
where p.module_path in ('pm/initiate-policy', 'pm/fill-checklist')
  and not exists (
    select 1 from public.page_sections ps
    where ps.section_id = s.id and ps.page_id = p.id
  );
