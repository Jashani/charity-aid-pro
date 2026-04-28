import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { mockActiveFunding, type ActiveFunding } from '@/lib/mock-data';

function mapRow(row: Record<string, unknown>): ActiveFunding {
  return {
    id: String(row.id ?? ''),
    funderName: String(row.funderName ?? row.funder_name ?? ''),
    programName: String(row.programName ?? row.program_name ?? ''),
    amount: Number(row.amount ?? 0),
    startDate: String(row.startDate ?? row.start_date ?? ''),
    endDate: String(row.endDate ?? row.end_date ?? ''),
    type: (row.type as ActiveFunding['type']) ?? 'grant',
    renewalEligible: Boolean(row.renewalEligible ?? row.renewal_eligible ?? false),
    notes: String(row.notes ?? ''),
  };
}

async function fetchActiveFunding(): Promise<{ data: ActiveFunding[]; source: 'supabase' | 'mock' }> {
  if (!supabase) {
    console.log('[useActiveFunding] Supabase not configured → using mock data');
    return { data: mockActiveFunding, source: 'mock' };
  }

  const { data, error } = await supabase
    .from('active_funding')
    .select('*')
    .order('end_date', { ascending: true });

  if (error) {
    console.warn('[useActiveFunding] Supabase query failed → using mock data:', error.message);
    return { data: mockActiveFunding, source: 'mock' };
  }

  if (!data || data.length === 0) {
    console.log('[useActiveFunding] Supabase returned empty → using mock data');
    return { data: mockActiveFunding, source: 'mock' };
  }

  console.log(`[useActiveFunding] ✅ Loaded ${data.length} grants from Supabase`);
  return { data: data.map(mapRow), source: 'supabase' };
}

export function useActiveFunding() {
  const query = useQuery({
    queryKey: ['activeFunding'],
    queryFn: fetchActiveFunding,
    staleTime: 1000 * 60 * 5,
  });

  return {
    ...query,
    data: query.data?.data ?? [],
    dataSource: query.data?.source ?? 'mock',
  };
}
