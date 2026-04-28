import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { mockOpportunities, type FundingOpportunity } from '@/lib/mock-data';
import type { DbFundingOpportunity } from '@/lib/database.types';

/** Map a DB row (snake_case) to the UI type (camelCase) */
function mapRow(row: DbFundingOpportunity): FundingOpportunity {
  return {
    id: row.id,
    funderName: row.funder_name,
    programName: row.program_name,
    amount: row.amount,
    amountMax: row.amount_max ?? undefined,
    type: row.type,
    deadline: row.deadline,
    location: row.location,
    duration: row.duration,
    durationMonths: row.duration_months,
    relationship: row.relationship,
    status: row.status,
    score: row.score,
    tags: row.tags ?? [],
    description: row.description,
    eligibility: row.eligibility,
    notes: row.notes,
    website: row.website,
    contactName: row.contact_name ?? undefined,
    contactEmail: row.contact_email ?? undefined,
    rejectionFeedback: row.rejection_feedback ?? undefined,
    lastApplied: row.last_applied ?? undefined,
    source: row.source,
  };
}

async function fetchOpportunities(): Promise<FundingOpportunity[]> {
  if (!supabase) return mockOpportunities;

  const { data, error } = await supabase
    .from('funding_opportunities')
    .select('*')
    .order('score', { ascending: false });

  if (error) {
    console.warn('Supabase fetch failed, using mock data:', error.message);
    return mockOpportunities;
  }

  if (!data || data.length === 0) {
    return mockOpportunities;
  }

  return (data as DbFundingOpportunity[]).map(mapRow);
}

export function useOpportunities() {
  return useQuery({
    queryKey: ['opportunities'],
    queryFn: fetchOpportunities,
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}
