import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export type UploadStatus = 'success' | 'failed';

export interface ConnectedAccount {
  platform: string;
  username: string;
  profile_picture?: string;
}

export interface UploadHistoryWithDetails {
  id: string;
  content_id: string | null;
  profile_id: string | null;
  uploaded_at: string;
  status: UploadStatus;
  error_message: string | null;
  user_id: string;
  contents: { file_name: string; file_url: string | null; platform: string | null } | null;
  profiles: { 
    name: string; 
    platform: string; 
    connected_accounts: ConnectedAccount[] | null 
  } | null;
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
        .select(`
          *,
          contents:content_id (file_name, file_url, platform),
          profiles:profile_id (name, platform, connected_accounts)
        `)
        .order('uploaded_at', { ascending: false });
      
      if (error) throw error;
      return data as unknown as UploadHistoryWithDetails[];
    },
    enabled: !!user
  });

  const addHistory = useMutation({
    mutationFn: async (history: { content_id: string | null; profile_id: string | null; status: UploadStatus; error_message: string | null }) => {
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
