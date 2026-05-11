import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { type FundingOpportunity } from '@/lib/mock-data';

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
    durationMonths: Number(row.duration_months ?? 12),
    status: (row.status as FundingOpportunity['status']) ?? 'identified',
    score: Number(row.final_score ?? row.score ?? 0),
    tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
    description: String(row.description ?? ''),
    notes: String(row.notes ?? ''),
    website: String(row.website ?? ''),
    contactName: row.contact_name != null ? String(row.contact_name) : undefined,
    contactEmail: row.contact_email != null ? String(row.contact_email) : undefined,
    expirationDate: row.expiration_date != null ? String(row.expiration_date) : undefined,
    amountAwarded: row.amount_awarded != null ? Number(row.amount_awarded) : undefined,
    dismissalReason: row.dismissal_reason != null ? String(row.dismissal_reason) : undefined,
    reapplicationDate: row.reapplication_date != null ? String(row.reapplication_date) : undefined,
  };
}

async function reviveRejected(): Promise<void> {
  if (!supabase) return;
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('opportunities')
    .select('id')
    .eq('status', 'rejected')
    .not('reapplication_date', 'is', null)
    .lte('reapplication_date', today);

  if (error || !data || data.length === 0) return;
  const ids = data.map((r) => r.id);
  await supabase
    .from('opportunities')
    .update({ status: 'identified', reapplication_date: null, updated_at: new Date().toISOString() })
    .in('id', ids);
}

async function fetchOpportunities(): Promise<FundingOpportunity[]> {
  if (!supabase) {
    console.warn('[useOpportunities] Supabase not configured');
    return [];
  }

  await reviveRejected();

  const { data, error } = await supabase
    .from('opportunities')
    .select('*')
    .order('final_score', { ascending: false, nullsFirst: false });

  if (error) {
    console.error('[useOpportunities] Supabase query failed:', error.message);
    throw error;
  }

  return (data ?? []).map(mapRow);
}

export function useOpportunities() {
  return useQuery({
    queryKey: ['opportunities'],
    queryFn: fetchOpportunities,
    staleTime: 1000 * 60 * 5,
  });
}
