import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export type ContentStatus = 'pending' | 'assigned' | 'scheduled' | 'uploaded' | 'failed' | 'removed';

export interface Content {
  id: string;
  file_name: string;
  caption: string | null;
  file_size: number;
  file_url: string | null;
  uploaded_at: string;
  assigned_profile_id: string | null;
  scheduled_at: string | null;
  scheduled_slot_id: string | null;
  status: ContentStatus;
  removed_at: string | null;
  removed_from_profile_id: string | null;
  user_id: string;
}

export function useContents(status?: ContentStatus | ContentStatus[]) {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['contents', user?.id, status],
    queryFn: async () => {
      if (!user) return [];
      let q = supabase
        .from('contents')
        .select('*')
        .order('uploaded_at', { ascending: false });
      
      if (status) {
        if (Array.isArray(status)) {
          q = q.in('status', status);
        } else {
          q = q.eq('status', status);
        }
      }
      
      const { data, error } = await q;
      if (error) throw error;
      return data as Content[];
    },
    enabled: !!user
  });

  const addContent = useMutation({
    mutationFn: async (content: Omit<Content, 'id' | 'user_id' | 'uploaded_at'>) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase
        .from('contents')
        .insert({ ...content, user_id: user.id })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add content', description: error.message, variant: 'destructive' });
    }
  });

  const updateContent = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Content> & { id: string }) => {
      const { error } = await supabase
        .from('contents')
        .update(updates)
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update content', description: error.message, variant: 'destructive' });
    }
  });

  const deleteContent = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('contents')
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contents'] });
      toast({ title: 'Content deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete content', description: error.message, variant: 'destructive' });
    }
  });

  const uploadFile = async (file: File): Promise<string | null> => {
    if (!user) return null;
    
    const fileExt = file.name.split('.').pop();
    const filePath = `${user.id}/${crypto.randomUUID()}.${fileExt}`;
    
    const { error } = await supabase.storage
      .from('content-files')
      .upload(filePath, file);
    
    if (error) {
      toast({ title: 'Failed to upload file', description: error.message, variant: 'destructive' });
      return null;
    }
    
    const { data: { publicUrl } } = supabase.storage
      .from('content-files')
      .getPublicUrl(filePath);
    
    return publicUrl;
  };

  return {
    contents: query.data ?? [],
    isLoading: query.isLoading,
    addContent,
    updateContent,
    deleteContent,
    uploadFile
  };
}
