import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

interface UpdateRuleInput {
  id: string;
  enabled: boolean;
}

export function useUpdateReminderRule() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, enabled }: UpdateRuleInput) => {
      if (!supabase) throw new Error('Supabase is not configured');
      const { error } = await supabase
        .from('reminder_rules')
        .update({ enabled, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminderRules'] });
    },
  });
}
