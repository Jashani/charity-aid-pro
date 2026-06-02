-- Reminder system schema
-- Powers the Reminders page and the daily email reminder cron job.

create type reminder_cadence as enum ('before_deadline');

-- ── reminder_rules ──────────────────────────────────────────────────────────
-- One row per rule type. v1 ships with a single 'deadline' rule; the table is
-- structured so future cadences ('weekly', 'monthly') drop in without schema
-- changes beyond extending the enum.
create table reminder_rules (
  id            text primary key,
  type          text not null,
  name          text not null,
  description   text not null default '',
  enabled       boolean not null default true,
  cadence       reminder_cadence not null,
  offsets_days  int[] not null default '{}'
                  check (array_length(offsets_days, 1) > 0),
  day_of_week   int check (day_of_week between 0 and 6),
  last_sent     timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger reminder_rules_set_updated_at
  before update on reminder_rules
  for each row execute function set_updated_at();

-- ── reminder_recipients ─────────────────────────────────────────────────────
-- Global list. Every enabled recipient receives every enabled rule.
-- Email uniqueness is enforced; the app layer lowercases before insert.
create table reminder_recipients (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  label       text not null default '',
  enabled     boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── reminder_log ────────────────────────────────────────────────────────────
-- The dedup table. Python inserts with `on conflict do nothing` before sending;
-- if the insert returns a row, send the email. The unique constraint is the
-- entire idempotency mechanism — `offset_days` is part of the key so a 30-day
-- reminder doesn't block the 7-day reminder for the same opp/rule/recipient.
--
-- `recipient` is plain text (not FK) so deleting a recipient doesn't erase
-- the audit trail of past sends.
create table reminder_log (
  id              uuid primary key default gen_random_uuid(),
  opportunity_id  text not null references opportunities(id) on delete cascade,
  rule_id         text not null references reminder_rules(id) on delete cascade,
  recipient       text not null,
  offset_days     int not null,
  sent_at         timestamptz not null default now(),
  unique (opportunity_id, rule_id, recipient, offset_days)
);

create index reminder_log_opp_idx     on reminder_log (opportunity_id);
create index reminder_log_sent_at_idx on reminder_log (sent_at desc);

-- ── RLS ─────────────────────────────────────────────────────────────────────
-- Mirror opportunities: any authenticated user can read/write rules and
-- recipients. reminder_log is read-only from the UI — the Python pipeline
-- writes it using the service-role key (which bypasses RLS).

alter table reminder_rules      enable row level security;
alter table reminder_recipients enable row level security;
alter table reminder_log        enable row level security;

create policy "authenticated read"   on reminder_rules
  for select to authenticated using (true);
create policy "authenticated update" on reminder_rules
  for update to authenticated using (true) with check (true);

create policy "authenticated read"   on reminder_recipients
  for select to authenticated using (true);
create policy "authenticated insert" on reminder_recipients
  for insert to authenticated with check (true);
create policy "authenticated delete" on reminder_recipients
  for delete to authenticated using (true);

create policy "authenticated read" on reminder_log
  for select to authenticated using (true);

-- ── Seed ────────────────────────────────────────────────────────────────────
insert into reminder_rules (id, type, name, description, cadence, offsets_days)
values (
  'deadline',
  'deadline',
  'Deadline approaching',
  'Reminds the team when an opportunity''s deadline is coming up.',
  'before_deadline',
  '{30, 7, 1}'
);
