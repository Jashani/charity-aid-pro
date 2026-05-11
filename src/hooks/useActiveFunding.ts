import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { type ActiveFunding } from '@/lib/mock-data';

function mapRow(row: Record<string, unknown>): ActiveFunding {
  return {
    id: String(row.id ?? ''),
    funderName: String(row.funder_name ?? ''),
    programName: String(row.program_name ?? ''),
    amount: Number(row.amount ?? 0),
    startDate: '',
    endDate: String(row.deadline ?? ''),
    type: (row.type as ActiveFunding['type']) ?? 'grant',
    renewalEligible: false,
    notes: String(row.notes ?? ''),
  };
}

async function fetchActiveFunding(): Promise<ActiveFunding[]> {
  if (!supabase) {
    console.warn('[useActiveFunding] Supabase not configured');
    return [];
  }

  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .eq('status', 'awarded')
    .order('deadline', { ascending: true });

  if (error) {
    console.error('[useActiveFunding] Supabase query failed:', error.message);
    throw error;
  }

  return (data ?? []).map(mapRow);
}

export function useActiveFunding() {
  return useQuery({
    queryKey: ['activeFunding'],
    queryFn: fetchActiveFunding,
    staleTime: 1000 * 60 * 5,
  });
}
