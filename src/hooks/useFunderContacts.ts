import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { type FunderContact } from '@/lib/mock-data';

function mapRow(row: Record<string, unknown>): FunderContact {
  return {
    id: String(row.id ?? ''),
    name: String(row.name ?? ''),
    organisation: String(row.organisation ?? row.organization ?? ''),
    email: String(row.email ?? ''),
    phone: row.phone != null ? String(row.phone) : undefined,
    role: String(row.role ?? ''),
    relationshipScore: Number(row.relationshipScore ?? row.relationship_score ?? 5),
    totalFunded: Number(row.totalFunded ?? row.total_funded ?? 0),
    applicationsCount: Number(row.applicationsCount ?? row.applications_count ?? 0),
    successRate: Number(row.successRate ?? row.success_rate ?? 0),
    lastContact: String(row.lastContact ?? row.last_contact ?? ''),
    notes: String(row.notes ?? ''),
  };
}

async function fetchFunderContacts(): Promise<FunderContact[]> {
  if (!supabase) {
    console.warn('[useFunderContacts] Supabase not configured');
    return [];
  }

  const { data, error } = await supabase
    .from('funder_contacts')
    .select('*')
    .order('relationship_score', { ascending: false });

  if (error) {
    console.error('[useFunderContacts] Supabase query failed:', error.message);
    throw error;
  }

  return (data ?? []).map(mapRow);
}

export function useFunderContacts() {
  return useQuery({
    queryKey: ['funderContacts'],
    queryFn: fetchFunderContacts,
    staleTime: 1000 * 60 * 5,
  });
}
