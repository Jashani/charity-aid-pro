create table funder_contacts (
  id                 uuid        primary key default gen_random_uuid(),
  organisation       text        not null,
  name               text        not null default '',
  email              text        not null default '',
  notes              text        not null default '',
  role               text        not null default '',
  relationship_score int         not null default 5,
  total_funded       numeric(12,2) not null default 0,
  applications_count int         not null default 0,
  success_rate       numeric(5,2) not null default 0,
  last_contact       date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- Enforce case-insensitive uniqueness on organisation name
create unique index funder_contacts_organisation_idx
  on funder_contacts (lower(organisation));

alter table funder_contacts enable row level security;

create policy "authenticated read"   on funder_contacts
  for select to authenticated using (true);
create policy "authenticated insert" on funder_contacts
  for insert to authenticated with check (true);
create policy "authenticated update" on funder_contacts
  for update to authenticated using (true) with check (true);
create policy "authenticated delete" on funder_contacts
  for delete to authenticated using (true);
