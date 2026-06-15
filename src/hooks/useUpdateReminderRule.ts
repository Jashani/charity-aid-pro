import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

interface UpdateRuleInput {
  id: string;
  enabled?: boolean;
  offsets_days?: number[];
}

export function useUpdateReminderRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, enabled, offsets_days }: UpdateRuleInput) => {
      if (!supabase) throw new Error('Supabase is not configured');
      const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (enabled !== undefined) payload.enabled = enabled;
      if (offsets_days !== undefined) payload.offsets_days = offsets_days;
      const { error } = await supabase
        .from('reminder_rules')
        .update(payload)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminderRules'] });
    },
  });
}
