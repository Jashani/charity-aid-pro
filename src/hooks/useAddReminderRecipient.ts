import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';

interface AddRecipientInput {
  email: string;
  label?: string;
}

export function useAddReminderRecipient() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, label }: AddRecipientInput) => {
      if (!supabase) throw new Error('Supabase is not configured');
      const { error } = await supabase
        .from('reminder_recipients')
        .insert({ email: email.trim().toLowerCase(), label: label ?? '' });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reminderRecipients'] });
    },
  });
}
