import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { mockFunderContacts, type FunderContact } from '@/lib/mock-data';

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

async function fetchFunderContacts(): Promise<{ data: FunderContact[]; source: 'supabase' | 'mock' }> {
  if (!supabase) {
    console.log('[useFunderContacts] Supabase not configured → using mock data');
    return { data: mockFunderContacts, source: 'mock' };
  }

  const { data, error } = await supabase
    .from('funder_contacts')
    .select('*')
    .order('relationship_score', { ascending: false });

  if (error) {
    console.warn('[useFunderContacts] Supabase query failed → using mock data:', error.message);
    return { data: mockFunderContacts, source: 'mock' };
  }

  if (!data || data.length === 0) {
    console.log('[useFunderContacts] Supabase returned empty → using mock data');
    return { data: mockFunderContacts, source: 'mock' };
  }

  console.log(`[useFunderContacts] ✅ Loaded ${data.length} contacts from Supabase`);
  return { data: data.map(mapRow), source: 'supabase' };
}

export function useFunderContacts() {
  const query = useQuery({
    queryKey: ['funderContacts'],
    queryFn: fetchFunderContacts,
    staleTime: 1000 * 60 * 5,
  });

  return {
    ...query,
    data: query.data?.data ?? [],
    dataSource: query.data?.source ?? 'mock',
  };
}
