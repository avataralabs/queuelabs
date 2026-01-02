import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';
import type { Json } from '@/integrations/supabase/types';

export type Platform = 'tiktok' | 'instagram' | 'youtube';

export interface ConnectedAccount {
  platform: string;
  username: string;
  profile_picture?: string;
  connected_at?: string;
}

export interface Profile {
  id: string;
  name: string;
  platform: Platform;
  created_at: string;
  user_id: string;
  uploadpost_username?: string;
  connected_accounts?: ConnectedAccount[];
  access_url?: string;
  access_url_expires_at?: string;
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
      return (data || []).map(item => ({
        ...item,
        platform: item.platform as Platform,
        connected_accounts: Array.isArray(item.connected_accounts) 
          ? item.connected_accounts as unknown as ConnectedAccount[]
          : []
      })) as Profile[];
    },
    enabled: !!user
  });

  const addProfile = useMutation({
    mutationFn: async ({ name }: { name: string }) => {
      if (!user) throw new Error('Not authenticated');
      
      // 1. Call Edge Function to create profile via webhook with user's name
      const { data: uploadpostData, error: fnError } = await supabase.functions.invoke(
        'uploadpost-create-profile',
        {
          body: {
            username: name
          }
        }
      );
      
      if (fnError) {
        console.error('Edge function error:', fnError);
        throw new Error(fnError.message || 'Failed to create profile');
      }

      // Handle error response from edge function (e.g., 409 Username already exists)
      if (uploadpostData?.error) {
        const errorMessage = uploadpostData.error;
        throw new Error(errorMessage);
      }
      
      // 2. Save to database with user's name as uploadpost_username
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          name,
          platform: 'tiktok', // Default platform
          user_id: user.id,
          uploadpost_username: name,
          access_url: uploadpostData?.access_url,
          access_url_expires_at: uploadpostData?.expires_at
        })
        .select()
        .single();
      
      if (error) throw error;
      
      // 3. Return data with access_url for redirect
      return { 
        ...data, 
        platform: data.platform as Platform,
        connected_accounts: Array.isArray(data.connected_accounts) 
          ? data.connected_accounts as unknown as ConnectedAccount[]
          : [],
        access_url: uploadpostData?.access_url 
      } as Profile & { access_url: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: 'Profile created successfully!' });
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
      // Fetch profile directly from database to ensure correct username
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('uploadpost_username')
        .eq('id', id)
        .single();
      
      if (fetchError) {
        console.error('Failed to fetch profile:', fetchError);
        throw new Error('Failed to fetch profile for deletion');
      }
      
      // Call edge function to delete from webhook
      if (profile?.uploadpost_username) {
        console.log('Deleting profile with username:', profile.uploadpost_username);
        
        const { error: fnError } = await supabase.functions.invoke(
          'uploadpost-delete-profile',
          {
            body: { username: profile.uploadpost_username }
          }
        );
        
        if (fnError) {
          console.error('Webhook delete error:', fnError);
          // Continue with local delete even if webhook fails
        }
      }
      
      // Delete from database
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

  // Sync connected accounts from Upload-Post
  const syncAccounts = useMutation({
    mutationFn: async (profileId: string) => {
      const profile = query.data?.find(p => p.id === profileId);
      if (!profile?.uploadpost_username) {
        throw new Error('Profile not connected to Upload-Post');
      }

      const { data, error } = await supabase.functions.invoke(
        'uploadpost-get-accounts',
        {
          body: { username: profile.uploadpost_username }
        }
      );

      if (error) throw error;

      // Update profile with connected accounts
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ connected_accounts: data.connected_accounts })
        .eq('id', profileId);

      if (updateError) throw updateError;

      return data.connected_accounts;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
    }
  });

  // Regenerate access URL for reconnecting (when access_url expired)
  const regenerateAccessUrl = useMutation({
    mutationFn: async (profileId: string) => {
      // Fetch profile directly from database to ensure we have the latest data
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('uploadpost_username')
        .eq('id', profileId)
        .single();

      if (fetchError || !profile?.uploadpost_username) {
        throw new Error('Profile not connected to Upload-Post');
      }

      console.log('Regenerating access URL for:', profile.uploadpost_username);

      // Use connect-account edge function - only returns access_url now
      const { data, error } = await supabase.functions.invoke(
        'uploadpost-connect-account',
        {
          body: { username: profile.uploadpost_username }
        }
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      return data.access_url;
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to generate access URL', description: error.message, variant: 'destructive' });
    }
  });

  // Refresh connected accounts after popup is closed
  const refreshAccounts = useMutation({
    mutationFn: async (profileId: string) => {
      // Fetch profile to get username
      const { data: profile, error: fetchError } = await supabase
        .from('profiles')
        .select('uploadpost_username')
        .eq('id', profileId)
        .single();

      if (fetchError || !profile?.uploadpost_username) {
        throw new Error('Profile not found');
      }

      console.log('Refreshing accounts for:', profile.uploadpost_username);

      // Call refresh edge function
      const { data, error } = await supabase.functions.invoke(
        'uploadpost-refresh-accounts',
        {
          body: { username: profile.uploadpost_username }
        }
      );

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Update profile with new connected accounts
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          connected_accounts: data.connected_accounts as unknown as Json
        })
        .eq('id', profileId);

      if (updateError) throw updateError;

      return data.connected_accounts;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: 'Accounts synced successfully!' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to sync accounts', description: error.message, variant: 'destructive' });
    }
  });

  return {
    profiles: query.data ?? [],
    isLoading: query.isLoading,
    addProfile,
    updateProfile,
    deleteProfile,
    syncAccounts,
    regenerateAccessUrl,
    refreshAccounts
  };
}
