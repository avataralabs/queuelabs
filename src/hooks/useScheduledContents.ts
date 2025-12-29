import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export interface ScheduledContent {
  id: string;
  content_id: string;
  profile_id: string;
  slot_id: string;
  scheduled_date: string;
  hour: number;
  minute: number;
  user_id: string;
}

export function useScheduledContents(profileId?: string, date?: Date) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['scheduled_contents', user?.id, profileId, date?.toISOString()],
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from('scheduled_contents')
        .select('*')
        .order('scheduled_date', { ascending: true });
      
      if (profileId) {
        q = q.eq('profile_id', profileId);
      }
      
      if (date) {
        const startOfDay = new Date(date);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(date);
        endOfDay.setHours(23, 59, 59, 999);
        
        q = q
          .gte('scheduled_date', startOfDay.toISOString())
          .lte('scheduled_date', endOfDay.toISOString());
      }
      
      const { data, error } = await q;
      if (error) throw error;
      return data as ScheduledContent[];
    },
    enabled: !!user
  });

  const scheduleContent = useMutation({
    mutationFn: async (scheduled: Omit<ScheduledContent, 'id' | 'user_id'>) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('scheduled_contents')
        .insert({ ...scheduled, user_id: user.id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled_contents'] });
      queryClient.invalidateQueries({ queryKey: ['contents'] });
      toast({ title: 'Content scheduled' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to schedule content', description: error.message, variant: 'destructive' });
    }
  });

  const unscheduleContent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('scheduled_contents')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scheduled_contents'] });
      queryClient.invalidateQueries({ queryKey: ['contents'] });
      toast({ title: 'Content unscheduled' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to unschedule content', description: error.message, variant: 'destructive' });
    }
  });

  return {
    scheduledContents: query.data ?? [],
    isLoading: query.isLoading,
    scheduleContent,
    unscheduleContent
  };
}
