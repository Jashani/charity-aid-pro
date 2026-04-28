/**
 * Database types for Supabase tables.
 * These mirror the TypeScript interfaces in mock-data.ts so that
 * data coming from the DB maps cleanly to the UI.
 *
 * When your friend finalises the schema, update the table/column
 * names here if they differ from these defaults.
 */

export interface DbFundingOpportunity {
  id: string;
  funder_name: string;
  program_name: string;
  amount: number;
  amount_max?: number | null;
  type: 'grant' | 'trust' | 'lottery' | 'corporate' | 'government';
  deadline: string;
  location: string;
  duration: 'single-year' | 'multi-year';
  duration_months: number;
  relationship: 'new' | 'previously-applied' | 'existing-funder' | 're-eligible';
  status: 'identified' | 'researching' | 'applying' | 'submitted' | 'awarded' | 'rejected';
  score: number;
  tags: string[];
  description: string;
  eligibility: string;
  notes: string;
  website: string;
  contact_name?: string | null;
  contact_email?: string | null;
  rejection_feedback?: string | null;
  last_applied?: string | null;
  source: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbActiveFunding {
  id: string;
  funder_name: string;
  program_name: string;
  amount: number;
  start_date: string;
  end_date: string;
  type: 'grant' | 'trust' | 'lottery' | 'corporate' | 'government';
  renewal_eligible: boolean;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbFunderContact {
  id: string;
  name: string;
  organisation: string;
  email: string;
  phone?: string | null;
  role: string;
  relationship_score: number;
  total_funded: number;
  applications_count: number;
  success_rate: number;
  last_contact: string;
  notes: string;
  created_at?: string;
  updated_at?: string;
}

export interface DbReminderRule {
  id: string;
  type: 'deadline' | 'renewal' | 're-eligibility' | 'digest';
  name: string;
  description: string;
  timing: string;
  enabled: boolean;
  last_sent?: string | null;
  created_at?: string;
  updated_at?: string;
}
