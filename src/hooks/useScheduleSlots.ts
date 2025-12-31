import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export type SlotType = 'daily' | 'weekly';

export interface ScheduleSlot {
  id: string;
  profile_id: string;
  hour: number;
  minute: number;
  is_active: boolean;
  type: SlotType;
  week_days: number[] | null;
  user_id: string;
  platform: string;
}

export function useScheduleSlots(profileId?: string, platform?: string) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['schedule_slots', user?.id, profileId, platform],
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from('schedule_slots')
        .select('*')
        .order('hour', { ascending: true });
      
      if (profileId) {
        q = q.eq('profile_id', profileId);
      }
      
      if (platform) {
        q = q.eq('platform', platform);
      }
      
      const { data, error } = await q;
      if (error) throw error;
      return data as ScheduleSlot[];
    },
    enabled: !!user
  });

  const addSlot = useMutation({
    mutationFn: async (slot: Omit<ScheduleSlot, 'id' | 'user_id'>) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('schedule_slots')
        .insert({ ...slot, user_id: user.id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule_slots'] });
      toast({ title: 'Time slot added' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add time slot', description: error.message, variant: 'destructive' });
    }
  });

  const updateSlot = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<ScheduleSlot> & { id: string }) => {
      const { error } = await supabase
        .from('schedule_slots')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule_slots'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update slot', description: error.message, variant: 'destructive' });
    }
  });

  const deleteSlot = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('schedule_slots')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedule_slots'] });
      toast({ title: 'Time slot removed' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to remove slot', description: error.message, variant: 'destructive' });
    }
  });

  return {
    slots: query.data ?? [],
    isLoading: query.isLoading,
    addSlot,
    updateSlot,
    deleteSlot
  };
}
