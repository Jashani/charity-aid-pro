import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

export interface ContactInput {
  organisation: string;
  name: string;
  email: string;
  notes: string;
}

async function upsertContact(input: ContactInput): Promise<void> {
  if (!supabase) throw new Error('Supabase not configured');

  const { data: existing, error: lookupError } = await supabase
    .from('funder_contacts')
    .select('id')
    .ilike('organisation', input.organisation)
    .limit(1)
    .maybeSingle();

  if (lookupError) throw lookupError;

  if (existing) {
    const { error } = await supabase
      .from('funder_contacts')
      .update({ name: input.name, email: input.email, notes: input.notes })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('funder_contacts').insert({
      organisation: input.organisation,
      name: input.name,
      email: input.email,
      notes: input.notes,
      role: '',
      relationship_score: 5,
      total_funded: 0,
      applications_count: 0,
      success_rate: 0,
      last_contact: new Date().toISOString().slice(0, 10),
    });
    if (error) throw error;
  }
}

export function useUpsertFunderContact() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertContact,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['funderContacts'] });
    },
  });
}
