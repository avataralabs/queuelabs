import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';

export function useAuth() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminRole = async (userId: string) => {
      try {
        const { data, error } = await supabase.rpc('has_role', {
          _user_id: userId,
          _role: 'admin'
        });
        if (error) {
          console.error('Error checking admin role:', error);
          setIsAdmin(false);
        } else {
          setIsAdmin(data === true);
        }
      } catch (err) {
        console.error('Error in checkAdminRole:', err);
        setIsAdmin(false);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Invalidate auth-related queries saat user berubah
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
          queryClient.invalidateQueries({ queryKey: ['isAdmin'] });
          queryClient.invalidateQueries({ queryKey: ['currentUserRole'] });
          queryClient.invalidateQueries({ queryKey: ['allUserRoles'] });
        }

        // Check admin role after auth state change
        if (session?.user) {
          setTimeout(() => {
            checkAdminRole(session.user.id).finally(() => setLoading(false));
          }, 0);
        } else {
          setIsAdmin(false);
          setLoading(false);
        }
      }
    );

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);

        if (session?.user) {
          checkAdminRole(session.user.id).finally(() => setLoading(false));
        } else {
          setLoading(false);
        }
      })
      .catch((error) => {
        console.error('Error getting session:', error);
        setLoading(false);
      });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const signOut = async () => {
    queryClient.clear();
    setIsAdmin(false);
    await supabase.auth.signOut();
  };

  return { user, session, loading, isAdmin, signOut };
}
