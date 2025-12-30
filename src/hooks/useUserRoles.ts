import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useToast } from './use-toast';

export type AppRole = 'admin' | 'user';

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
  is_approved: boolean;
  last_sign_in_at?: string | null;
  email?: string | null;
}

export interface UserWithRole {
  id: string;
  email: string;
  role: AppRole;
  created_at: string;
  last_sign_in_at: string | null;
}

export function useUserRoles() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Check if current user is admin
  const isAdminQuery = useQuery({
    queryKey: ['isAdmin', user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .rpc('has_role', { _user_id: user.id, _role: 'admin' });
      
      if (error) {
        console.error('Error checking admin status:', error);
        return false;
      }
      return data ?? false;
    },
    enabled: !!user,
    staleTime: 0,  // Selalu refetch untuk memastikan data fresh
    gcTime: 1000 * 60 * 5,  // 5 minutes cache retention
  });

  // Get current user's role
  const currentUserRoleQuery = useQuery({
    queryKey: ['currentUserRole', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }
      return data as UserRole | null;
    },
    enabled: !!user
  });

  // Get all user roles with last_sign_in_at (admin only)
  const allRolesQuery = useQuery({
    queryKey: ['allUserRoles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      // Fetch last_sign_in_at and email for each user
      const rolesWithUserInfo = await Promise.all(
        (data as UserRole[]).map(async (role) => {
          const [lastSignInResult, emailResult] = await Promise.all([
            supabase.rpc('get_user_last_sign_in', { _user_id: role.user_id }),
            supabase.rpc('get_user_email', { _user_id: role.user_id })
          ]);
          return {
            ...role,
            last_sign_in_at: lastSignInResult.data as string | null,
            email: emailResult.data as string | null
          };
        })
      );
      
      return rolesWithUserInfo;
    },
    enabled: isAdminQuery.data === true
  });

  const updateRole = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      // First check if user already has a role
      const { data: existing } = await supabase
        .from('user_roles')
        .select('id')
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        // Update existing role
        const { error } = await supabase
          .from('user_roles')
          .update({ role })
          .eq('user_id', userId);
        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUserRoles'] });
      toast({ title: 'Role updated successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to update role', description: error.message, variant: 'destructive' });
    }
  });

  const deleteUserRole = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUserRoles'] });
      toast({ title: 'User deleted' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to delete role', description: error.message, variant: 'destructive' });
    }
  });

  const approveUser = useMutation({
    mutationFn: async (userId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .update({ is_approved: true })
        .eq('user_id', userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUserRoles'] });
      toast({ title: 'User approved successfully' });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to approve user', description: error.message, variant: 'destructive' });
    }
  });

  return {
    isAdmin: isAdminQuery.data ?? false,
    isAdminLoading: isAdminQuery.isLoading,
    currentUserRole: currentUserRoleQuery.data,
    allRoles: allRolesQuery.data ?? [],
    allRolesLoading: allRolesQuery.isLoading,
    updateRole,
    deleteUserRole,
    approveUser
  };
}
