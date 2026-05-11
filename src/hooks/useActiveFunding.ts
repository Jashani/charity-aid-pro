import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { type ActiveFunding } from '@/lib/mock-data';

function mapRow(row: Record<string, unknown>): ActiveFunding {
  const awarded = row.amount_awarded != null ? Number(row.amount_awarded) : Number(row.amount ?? 0);
  return {
    id: String(row.id ?? ''),
    funderName: String(row.funder_name ?? ''),
    programName: String(row.program_name ?? ''),
    amount: awarded,
    startDate: '',
    endDate: row.expiration_date != null ? String(row.expiration_date) : '',
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
    .order('expiration_date', { ascending: true, nullsFirst: false });

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
