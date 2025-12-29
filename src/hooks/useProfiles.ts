import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export type Platform = 'tiktok' | 'instagram' | 'youtube';

export interface Profile {
  id: string;
  name: string;
  platform: Platform;
  created_at: string;
  user_id: string;
}

export function useProfiles() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['profiles', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data as Profile[];
    },
    enabled: !!user
  });

  const addProfile = useMutation({
    mutationFn: async ({ name, platform }: { name: string; platform: Platform }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('profiles')
        .insert({ name, platform, user_id: user.id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: 'Profile created successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to create profile', description: error.message, variant: 'destructive' });
    }
  });

  const updateProfile = useMutation({
    mutationFn: async ({ id, name, platform }: { id: string; name: string; platform: Platform }) => {
      const { error } = await supabase
        .from('profiles')
        .update({ name, platform })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: 'Profile updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update profile', description: error.message, variant: 'destructive' });
    }
  });

  const deleteProfile = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('profiles')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: 'Profile deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete profile', description: error.message, variant: 'destructive' });
    }
  });

  return {
    profiles: query.data ?? [],
    isLoading: query.isLoading,
    addProfile,
    updateProfile,
    deleteProfile
  };
}
