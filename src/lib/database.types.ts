/**
 * Types matching the real data shape from the scoring pipeline (result.json).
 *
 * The email parser outputs camelCase JSON. When stored in Supabase (Postgres),
 * columns may be snake_case — the hooks handle both conventions.
 */

// ── Scoring pipeline sub-types (from result.json) ─────────────

export interface GatingResult {
  status: 'passed' | 'failed' | 'needs_review';
  extraction_confidence: { pass: boolean; value: number };
  eligibility: { pass: boolean; confidence: number; reasoning: string };
  geography: { pass: boolean; location: string; specificity: string | null };
  reapplication: { pass: boolean; relationship: string };
}

export interface ScoringBreakdown {
  strategic_fit: { raw: number; geography_modifier: number; final: number; reasoning: string };
  funding_value: { score: number; amount_used: number };
  probability: { score: number; reasoning: string };
  effort: { score: number; reasoning: string };
  strategic_value: { score: number; reasoning: string };
}

export interface TimingInfo {
  score: number | null;
  days_to_deadline: number | null;
}

// ── Main opportunity type as it comes from the pipeline ────────

export interface PipelineOpportunity {
  id: string;
  funderName: string;
  programName: string;
  amount: number;
  amountMax: number | null;
  type: 'grant' | 'trust' | 'lottery' | 'corporate' | 'government';
  deadline: string; // may be "unknown"
  location: string;
  duration: 'single-year' | 'multi-year';
  durationMonths: number;
  relationship: 'new' | 'previously-applied' | 'existing-funder' | 're-eligible';
  status: 'identified' | 'researching' | 'applying' | 'submitted' | 'awarded' | 'rejected';
  score: number; // raw score (usually 0 from pipeline)
  tags: string[];
  description: string;
  eligibility: string;
  notes: string;
  website: string;
  contactName: string | null;
  contactEmail: string | null;
  source: string;

  // Pipeline-specific fields
  extractionConfidence: number;
  gating: GatingResult | null;
  scores: ScoringBreakdown | null;
  timing: TimingInfo | null;
  final_score: number | null; // ← this is the real score the UI should display
  suggested_tags: string[];
  scored_at: string;
}
