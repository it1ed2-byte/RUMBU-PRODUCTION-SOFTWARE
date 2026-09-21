-- =====================================================================
-- RUMBU INDUSTRIES GROUP — Production Initiation workflow
-- One initiation per (production_date, shift), status Pending -> Completed.
-- =====================================================================

create table if not exists public.weaving_production_initiations (
  id              bigint generated always as identity primary key,
  production_date date not null,
  shift           text not null check (shift in ('Morning','Night')),
  work_type       text not null check (work_type in ('Normal','B Grade','Cover Duty','Overtime','Extra Operators','Breakdown')),
  status          text not null default 'Pending' check (status in ('Pending','Completed')),
  initiated_by    text not null,
  initiated_at    timestamptz not null default now(),
  completed_by    text,
  completed_at    timestamptz,
  unique (production_date, shift)
);
create index if not exists idx_weaving_production_initiations_status on public.weaving_production_initiations (status);

alter table public.weaving_production_initiations enable row level security;

drop policy if exists "read_weaving_production_initiations" on public.weaving_production_initiations;
create policy "read_weaving_production_initiations" on public.weaving_production_initiations
  for select to anon, authenticated using (true);

drop policy if exists "admin_insert_weaving_production_initiations" on public.weaving_production_initiations;
create policy "admin_insert_weaving_production_initiations" on public.weaving_production_initiations
  for insert to authenticated
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));

drop policy if exists "admin_update_weaving_production_initiations" on public.weaving_production_initiations;
create policy "admin_update_weaving_production_initiations" on public.weaving_production_initiations
  for update to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));

drop policy if exists "admin_delete_weaving_production_initiations" on public.weaving_production_initiations;
create policy "admin_delete_weaving_production_initiations" on public.weaving_production_initiations
  for delete to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role in ('admin','super_admin')));

-- Allow any authenticated user to write production entries into matweaving
-- (floor-level data entry, not an admin-only action). Adjust if you'd
-- rather restrict this further.
alter table public.matweaving enable row level security;
drop policy if exists "read_matweaving" on public.matweaving;
create policy "read_matweaving" on public.matweaving for select to anon, authenticated using (true);
drop policy if exists "authenticated_insert_matweaving" on public.matweaving;
create policy "authenticated_insert_matweaving" on public.matweaving for insert to authenticated with check (true);

-- Register the new "Enter Production" page under the Weaving module.
insert into public.pages (name, module_id, module_path)
select 'Enter Production', m.id, 'weaving/enter-production'
from public.modules m
where m.name = 'Weaving'
  and not exists (select 1 from public.pages where module_path = 'weaving/enter-production');
