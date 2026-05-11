import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { type ReminderRule } from '@/lib/mock-data';

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

async function fetchReminderRules(): Promise<ReminderRule[]> {
  if (!supabase) {
    console.warn('[useReminderRules] Supabase not configured');
    return [];
  }

  const { data, error } = await supabase
    .from('reminder_rules')
    .select('*')
    .order('type', { ascending: true });

  if (error) {
    console.error('[useReminderRules] Supabase query failed:', error.message);
    throw error;
  }

  return (data ?? []).map(mapRow);
}

export function useReminderRules() {
  return useQuery({
    queryKey: ['reminderRules'],
    queryFn: fetchReminderRules,
    staleTime: 1000 * 60 * 5,
  });
}
