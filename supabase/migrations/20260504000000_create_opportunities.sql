-- Funding opportunities schema
-- Mirrors email_parsing/core/schema.py::FundingOpportunity

create type funding_type as enum (
  'grant', 'trust', 'lottery', 'corporate', 'government'
);

create type opportunity_status as enum (
  'identified', 'researching', 'applying', 'submitted', 'awarded', 'rejected'
);

create type duration_type as enum ('single-year', 'multi-year');

create table opportunities (
  id text primary key,

  funder_name  text not null,
  program_name text not null,
  amount       numeric(12, 2) not null,
  amount_max   numeric(12, 2),
  type         funding_type not null,
  deadline     text not null,
  location     text not null,
  duration     duration_type not null,
  duration_months int not null,
  status       opportunity_status not null default 'identified',
  score        numeric(5, 2) not null default 0
                 check (score between 0 and 100),
  tags         text[] not null default '{}',
  description  text not null,
  eligibility  text not null,
  notes        text not null default '',
  website      text not null,
  contact_name  text,
  contact_email text,
  source       text not null,

  extraction_confidence numeric(4, 3) not null default 0
                 check (extraction_confidence between 0 and 1),

  -- Scoring pipeline output (see email_parsing/scoring/models.py)
  gating          jsonb,
  scores          jsonb,
  timing          jsonb,
  final_score     numeric(5, 2)
                    check (final_score is null or final_score between 0 and 100),
  suggested_tags  text[] not null default '{}',
  scored_at       timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index opportunities_status_idx       on opportunities (status);
create index opportunities_type_idx         on opportunities (type);
create index opportunities_final_score_idx  on opportunities (final_score desc nulls last);
create index opportunities_scored_at_idx    on opportunities (scored_at desc nulls last);
create index opportunities_tags_idx         on opportunities using gin (tags);

-- Auto-maintain updated_at
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger opportunities_set_updated_at
  before update on opportunities
  for each row execute function set_updated_at();

-- RLS: enabled with permissive policies for any authenticated user.
-- Tighten these when auth/roles are introduced.
alter table opportunities enable row level security;

create policy "authenticated read"   on opportunities
  for select to authenticated using (true);

create policy "authenticated insert" on opportunities
  for insert to authenticated with check (true);

create policy "authenticated update" on opportunities
  for update to authenticated using (true) with check (true);

create policy "authenticated delete" on opportunities
  for delete to authenticated using (true);
