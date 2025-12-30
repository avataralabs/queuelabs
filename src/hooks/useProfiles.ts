import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

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
      
      // Generate unique username for Upload-Post
      const uploadpostUsername = `queuelabs_${user.id.slice(0, 8)}_${Date.now()}`;
      
      // 1. Call Edge Function to create profile via webhook
      const { data: uploadpostData, error: fnError } = await supabase.functions.invoke(
        'uploadpost-create-profile',
        {
          body: {
            username: uploadpostUsername
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
      
      // 2. Save to database
      const { data, error } = await supabase
        .from('profiles')
        .insert({
          name,
          platform: 'tiktok', // Default platform
          user_id: user.id,
          uploadpost_username: uploadpostUsername,
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
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      toast({ title: 'Profile created! Redirecting to connect your account...' });
      
      // Redirect user to Upload-Post connect page
      if (data.access_url) {
        setTimeout(() => {
          window.location.href = data.access_url;
        }, 1000);
      }
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
      // Get profile to find the username
      const profile = query.data?.find(p => p.id === id);
      
      // Call edge function to delete from webhook
      if (profile?.uploadpost_username) {
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

  // Regenerate access URL for reconnecting
  const regenerateAccessUrl = useMutation({
    mutationFn: async (profileId: string) => {
      const profile = query.data?.find(p => p.id === profileId);
      if (!profile?.uploadpost_username) {
        throw new Error('Profile not connected to Upload-Post');
      }

      const redirectUrl = `${window.location.origin}/profiles?connected=true`;

      const { data, error } = await supabase.functions.invoke(
        'uploadpost-create-profile',
        {
          body: {
            username: profile.uploadpost_username,
            platform: profile.platform,
            redirect_url: redirectUrl
          }
        }
      );

      if (error) throw error;

      // Update profile with new access URL
      await supabase
        .from('profiles')
        .update({
          access_url: data.access_url,
          access_url_expires_at: data.expires_at
        })
        .eq('id', profileId);

      return data.access_url;
    },
    onSuccess: (accessUrl) => {
      queryClient.invalidateQueries({ queryKey: ['profiles'] });
      if (accessUrl) {
        window.location.href = accessUrl;
      }
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to reconnect', description: error.message, variant: 'destructive' });
    }
  });

  return {
    profiles: query.data ?? [],
    isLoading: query.isLoading,
    addProfile,
    updateProfile,
    deleteProfile,
    syncAccounts,
    regenerateAccessUrl
  };
}
