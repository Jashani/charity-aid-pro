-- ==========================================================
-- Charity Aid Pro — Supabase Schema
-- Run this in the Supabase SQL Editor to create all tables.
-- ==========================================================

-- Funding Opportunities (discovered / pipeline items)
CREATE TABLE IF NOT EXISTS funding_opportunities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funder_name TEXT NOT NULL,
  program_name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  amount_max INTEGER,
  type TEXT NOT NULL CHECK (type IN ('grant','trust','lottery','corporate','government')),
  deadline DATE NOT NULL,
  location TEXT NOT NULL DEFAULT 'UK-wide',
  duration TEXT NOT NULL CHECK (duration IN ('single-year','multi-year')),
  duration_months INTEGER NOT NULL DEFAULT 12,
  relationship TEXT NOT NULL CHECK (relationship IN ('new','previously-applied','existing-funder','re-eligible')),
  status TEXT NOT NULL CHECK (status IN ('identified','researching','applying','submitted','awarded','rejected')) DEFAULT 'identified',
  score INTEGER NOT NULL DEFAULT 50,
  tags TEXT[] DEFAULT '{}',
  description TEXT DEFAULT '',
  eligibility TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  website TEXT DEFAULT '',
  contact_name TEXT,
  contact_email TEXT,
  rejection_feedback TEXT,
  last_applied DATE,
  source TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Active Funding (current grants)
CREATE TABLE IF NOT EXISTS active_funding (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  funder_name TEXT NOT NULL,
  program_name TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('grant','trust','lottery','corporate','government')),
  renewal_eligible BOOLEAN NOT NULL DEFAULT false,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Funder Contacts
CREATE TABLE IF NOT EXISTS funder_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  organisation TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT '',
  relationship_score INTEGER NOT NULL DEFAULT 5,
  total_funded INTEGER NOT NULL DEFAULT 0,
  applications_count INTEGER NOT NULL DEFAULT 0,
  success_rate INTEGER NOT NULL DEFAULT 0,
  last_contact DATE,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Reminder Rules
CREATE TABLE IF NOT EXISTS reminder_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('deadline','renewal','re-eligibility','digest')),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  timing TEXT DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_sent TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================================
-- Row Level Security (RLS)
-- All authenticated users can read; only authenticated can write.
-- Adjust if you need per-user scoping later.
-- ==========================================================

ALTER TABLE funding_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE active_funding ENABLE ROW LEVEL SECURITY;
ALTER TABLE funder_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminder_rules ENABLE ROW LEVEL SECURITY;

-- Read access for authenticated users
CREATE POLICY "Authenticated users can read funding_opportunities"
  ON funding_opportunities FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read active_funding"
  ON active_funding FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read funder_contacts"
  ON funder_contacts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can read reminder_rules"
  ON reminder_rules FOR SELECT TO authenticated USING (true);

-- Write access for authenticated users
CREATE POLICY "Authenticated users can insert funding_opportunities"
  ON funding_opportunities FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update funding_opportunities"
  ON funding_opportunities FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert active_funding"
  ON active_funding FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update active_funding"
  ON active_funding FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert funder_contacts"
  ON funder_contacts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update funder_contacts"
  ON funder_contacts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert reminder_rules"
  ON reminder_rules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update reminder_rules"
  ON reminder_rules FOR UPDATE TO authenticated USING (true);
