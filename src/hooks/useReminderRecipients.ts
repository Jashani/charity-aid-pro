import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { type ReminderRecipient } from '@/lib/mock-data';

function mapRow(row: Record<string, unknown>): ReminderRecipient {
  return {
    id: String(row.id ?? ''),
    email: String(row.email ?? ''),
    label: String(row.label ?? ''),
    enabled: Boolean(row.enabled ?? true),
  };
}

async function fetchReminderRecipients(): Promise<ReminderRecipient[]> {
  if (!supabase) {
    console.warn('[useReminderRecipients] Supabase not configured');
    return [];
  }

  const { data, error } = await supabase
    .from('reminder_recipients')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[useReminderRecipients] Supabase query failed:', error.message);
    throw error;
  }

  return (data ?? []).map(mapRow);
}

export function useReminderRecipients() {
  return useQuery({
    queryKey: ['reminderRecipients'],
    queryFn: fetchReminderRecipients,
    staleTime: 1000 * 60 * 5,
  });
}
