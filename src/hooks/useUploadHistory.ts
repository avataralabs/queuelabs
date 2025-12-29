import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export type UploadStatus = 'success' | 'failed';

export interface UploadHistory {
  id: string;
  content_id: string | null;
  profile_id: string | null;
  uploaded_at: string;
  status: UploadStatus;
  error_message: string | null;
  user_id: string;
}

export function useUploadHistory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['upload_history', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from('upload_history')
        .select('*')
        .order('uploaded_at', { ascending: false });
      
      if (error) throw error;
      return data as UploadHistory[];
    },
    enabled: !!user
  });

  const addHistory = useMutation({
    mutationFn: async (history: Omit<UploadHistory, 'id' | 'user_id' | 'uploaded_at'>) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('upload_history')
        .insert({ ...history, user_id: user.id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['upload_history'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to log upload', description: error.message, variant: 'destructive' });
    }
  });

  return {
    history: query.data ?? [],
    isLoading: query.isLoading,
    addHistory
  };
}
