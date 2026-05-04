import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { mockReminderRules, type ReminderRule } from '@/lib/mock-data';

function mapRow(row: Record<string, unknown>): ReminderRule {
  return {
    id: String(row.id ?? ''),
    type: (row.type as ReminderRule['type']) ?? 'deadline',
    name: String(row.name ?? ''),
    description: String(row.description ?? ''),
    timing: String(row.timing ?? ''),
    enabled: Boolean(row.enabled ?? true),
    lastSent: row.lastSent != null ? String(row.lastSent) : (row.last_sent != null ? String(row.last_sent) : undefined),
  };
}

async function fetchReminderRules(): Promise<{ data: ReminderRule[]; source: 'supabase' | 'mock' }> {
  if (!supabase) {
    console.log('[useReminderRules] Supabase not configured → using mock data');
    return { data: mockReminderRules, source: 'mock' };
  }

  const { data, error } = await supabase
    .from('reminder_rules')
    .select('*')
    .order('type', { ascending: true });

  if (error) {
    console.warn('[useReminderRules] Supabase query failed → using mock data:', error.message);
    return { data: mockReminderRules, source: 'mock' };
  }

  if (!data || data.length === 0) {
    console.log('[useReminderRules] Supabase returned empty → using mock data');
    return { data: mockReminderRules, source: 'mock' };
  }

  console.log(`[useReminderRules] ✅ Loaded ${data.length} rules from Supabase`);
  return { data: data.map(mapRow), source: 'supabase' };
}

export function useReminderRules() {
  const query = useQuery({
    queryKey: ['reminderRules'],
    queryFn: fetchReminderRules,
    staleTime: 1000 * 60 * 5,
  });

  return {
    ...query,
    data: query.data?.data ?? [],
    dataSource: query.data?.source ?? 'mock',
  };
}
