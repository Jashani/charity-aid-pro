import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { mockReminderRules, type ReminderRule } from '@/lib/mock-data';
import type { DbReminderRule } from '@/lib/database.types';

function mapRow(row: DbReminderRule): ReminderRule {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    description: row.description,
    timing: row.timing,
    enabled: row.enabled,
    lastSent: row.last_sent ?? undefined,
  };
}

async function fetchReminderRules(): Promise<ReminderRule[]> {
  if (!supabase) return mockReminderRules;

  const { data, error } = await supabase
    .from('reminder_rules')
    .select('*')
    .order('type', { ascending: true });

  if (error) {
    console.warn('Supabase fetch failed, using mock data:', error.message);
    return mockReminderRules;
  }

  if (!data || data.length === 0) {
    return mockReminderRules;
  }

  return (data as DbReminderRule[]).map(mapRow);
}

export function useReminderRules() {
  return useQuery({
    queryKey: ['reminderRules'],
    queryFn: fetchReminderRules,
    staleTime: 1000 * 60 * 5,
  });
}
