import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { mockFunderContacts, type FunderContact } from '@/lib/mock-data';
import type { DbFunderContact } from '@/lib/database.types';

function mapRow(row: DbFunderContact): FunderContact {
  return {
    id: row.id,
    name: row.name,
    organisation: row.organisation,
    email: row.email,
    phone: row.phone ?? undefined,
    role: row.role,
    relationshipScore: row.relationship_score,
    totalFunded: row.total_funded,
    applicationsCount: row.applications_count,
    successRate: row.success_rate,
    lastContact: row.last_contact,
    notes: row.notes,
  };
}

async function fetchFunderContacts(): Promise<FunderContact[]> {
  if (!supabase) return mockFunderContacts;

  const { data, error } = await supabase
    .from('funder_contacts')
    .select('*')
    .order('relationship_score', { ascending: false });

  if (error) {
    console.warn('Supabase fetch failed, using mock data:', error.message);
    return mockFunderContacts;
  }

  if (!data || data.length === 0) {
    return mockFunderContacts;
  }

  return (data as DbFunderContact[]).map(mapRow);
}

export function useFunderContacts() {
  return useQuery({
    queryKey: ['funderContacts'],
    queryFn: fetchFunderContacts,
    staleTime: 1000 * 60 * 5,
  });
}
