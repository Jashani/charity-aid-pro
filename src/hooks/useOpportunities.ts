import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { type FundingOpportunity } from '@/lib/mock-data';

function mapRow(row: Record<string, unknown>): FundingOpportunity {
  return {
    id: String(row.id ?? ''),
    funderName: String(row.funder_name ?? ''),
    programName: String(row.program_name ?? ''),
    amount: Number(row.amount ?? 0),
    amountMax: row.amount_max != null ? Number(row.amount_max) : undefined,
    type: (row.type as FundingOpportunity['type']) ?? 'grant',
    deadline: String(row.deadline ?? ''),
    location: String(row.location ?? ''),
    duration: (row.duration as FundingOpportunity['duration']) ?? 'single-year',
    durationMonths: Number(row.duration_months ?? 12),
    relationship: (row.relationship as FundingOpportunity['relationship']) ?? 'new',
    status: (row.status as FundingOpportunity['status']) ?? 'identified',
    score: Number(row.final_score ?? row.score ?? 0),
    tags: Array.isArray(row.suggested_tags) && (row.suggested_tags as string[]).length > 0
      ? (row.suggested_tags as string[])
      : Array.isArray(row.tags) ? (row.tags as string[]) : [],
    description: String(row.description ?? ''),
    eligibility: String(row.eligibility ?? ''),
    notes: String(row.notes ?? ''),
    website: String(row.website ?? ''),
    contactName: row.contact_name != null ? String(row.contact_name) : undefined,
    contactEmail: row.contact_email != null ? String(row.contact_email) : undefined,
    source: String(row.source ?? ''),
  };
}

async function fetchOpportunities(): Promise<FundingOpportunity[]> {
  if (!supabase) {
    console.warn('[useOpportunities] Supabase not configured');
    return [];
  }

  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .order('final_score', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('[useOpportunities] Supabase query failed:', error.message);
    throw error;
  }

  return (data ?? []).map(mapRow);
}

export function useOpportunities() {
  return useQuery({
    queryKey: ['opportunities'],
    queryFn: fetchOpportunities,
    staleTime: 1000 * 60 * 5,
  });
}
