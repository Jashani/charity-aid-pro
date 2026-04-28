import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { mockOpportunities, type FundingOpportunity } from '@/lib/mock-data';

/**
 * Maps a row from Supabase to the UI type.
 *
 * The email parser outputs camelCase JSON (see result.json) with extra fields
 * like `final_score`, `suggested_tags`, `gating`, `scores`, etc.
 * This mapper normalises those into the `FundingOpportunity` shape the UI expects.
 */
function mapRow(row: Record<string, unknown>): FundingOpportunity {
  return {
    id: String(row.id ?? ''),
    funderName: String(row.funderName ?? row.funder_name ?? ''),
    programName: String(row.programName ?? row.program_name ?? ''),
    amount: Number(row.amount ?? 0),
    amountMax: row.amountMax != null ? Number(row.amountMax) : (row.amount_max != null ? Number(row.amount_max) : undefined),
    type: (row.type as FundingOpportunity['type']) ?? 'grant',
    deadline: String(row.deadline ?? ''),
    location: String(row.location ?? ''),
    duration: (row.duration as FundingOpportunity['duration']) ?? 'single-year',
    durationMonths: Number(row.durationMonths ?? row.duration_months ?? 12),
    relationship: (row.relationship as FundingOpportunity['relationship']) ?? 'new',
    status: (row.status as FundingOpportunity['status']) ?? 'identified',
    // Use final_score (from scoring pipeline) if present, otherwise fall back to score
    score: Number(row.final_score ?? row.finalScore ?? row.score ?? 0),
    // Use suggested_tags if tags is empty
    tags: Array.isArray(row.suggested_tags ?? row.suggestedTags) && (row.suggested_tags as string[] ?? row.suggestedTags as string[]).length > 0
      ? (row.suggested_tags ?? row.suggestedTags) as string[]
      : Array.isArray(row.tags) ? row.tags as string[] : [],
    description: String(row.description ?? ''),
    eligibility: String(row.eligibility ?? ''),
    notes: String(row.notes ?? ''),
    website: String(row.website ?? ''),
    contactName: row.contactName != null ? String(row.contactName) : (row.contact_name != null ? String(row.contact_name) : undefined),
    contactEmail: row.contactEmail != null ? String(row.contactEmail) : (row.contact_email != null ? String(row.contact_email) : undefined),
    rejectionFeedback: row.rejectionFeedback != null ? String(row.rejectionFeedback) : (row.rejection_feedback != null ? String(row.rejection_feedback) : undefined),
    lastApplied: row.lastApplied != null ? String(row.lastApplied) : (row.last_applied != null ? String(row.last_applied) : undefined),
    source: String(row.source ?? ''),
  };
}

async function fetchOpportunities(): Promise<{ data: FundingOpportunity[]; source: 'supabase' | 'mock' }> {
  if (!supabase) {
    console.log('[useOpportunities] Supabase not configured → using mock data');
    return { data: mockOpportunities, source: 'mock' };
  }

  const { data, error } = await supabase
    .from('funding_opportunities')
    .select('*')
    .order('final_score', { ascending: false });

  if (error) {
    console.warn('[useOpportunities] Supabase query failed → using mock data:', error.message);
    return { data: mockOpportunities, source: 'mock' };
  }

  if (!data || data.length === 0) {
    console.log('[useOpportunities] Supabase returned empty → using mock data');
    return { data: mockOpportunities, source: 'mock' };
  }

  console.log(`[useOpportunities] ✅ Loaded ${data.length} opportunities from Supabase`);
  return { data: data.map(mapRow), source: 'supabase' };
}

export function useOpportunities() {
  const query = useQuery({
    queryKey: ['opportunities'],
    queryFn: fetchOpportunities,
    staleTime: 1000 * 60 * 5,
  });

  return {
    ...query,
    data: query.data?.data ?? [],
    dataSource: query.data?.source ?? 'mock',
  };
}
