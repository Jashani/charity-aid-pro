import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { mockActiveFunding, type ActiveFunding } from '@/lib/mock-data';
import type { DbActiveFunding } from '@/lib/database.types';

function mapRow(row: DbActiveFunding): ActiveFunding {
  return {
    id: row.id,
    funderName: row.funder_name,
    programName: row.program_name,
    amount: row.amount,
    startDate: row.start_date,
    endDate: row.end_date,
    type: row.type,
    renewalEligible: row.renewal_eligible,
    notes: row.notes,
  };
}

async function fetchActiveFunding(): Promise<ActiveFunding[]> {
  if (!supabase) return mockActiveFunding;

  const { data, error } = await supabase
    .from('active_funding')
    .select('*')
    .order('end_date', { ascending: true });

  if (error) {
    console.warn('Supabase fetch failed, using mock data:', error.message);
    return mockActiveFunding;
  }

  if (!data || data.length === 0) {
    return mockActiveFunding;
  }

  return (data as DbActiveFunding[]).map(mapRow);
}

export function useActiveFunding() {
  return useQuery({
    queryKey: ['activeFunding'],
    queryFn: fetchActiveFunding,
    staleTime: 1000 * 60 * 5,
  });
}
