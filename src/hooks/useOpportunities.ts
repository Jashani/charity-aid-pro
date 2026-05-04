import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { mockOpportunities, type FundingOpportunity } from '@/lib/mock-data';

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
    rejectionFeedback: undefined, // not in schema
    lastApplied: undefined,       // not in schema
    source: String(row.source ?? ''),
  };
}

async function fetchOpportunities(): Promise<{ data: FundingOpportunity[]; source: 'supabase' | 'mock' }> {
  if (!supabase) {
    console.log('[useOpportunities] Supabase not configured → using mock data');
    return { data: mockOpportunities, source: 'mock' };
  }

  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .order('final_score', { ascending: false, nullsFirst: false });

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