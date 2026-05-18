'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Profile } from '@/types';

export function useAuth() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetch = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      const { data } = await supabase.from('profiles').select('*, sector:sectors(*)').eq('id', user.id).single();
      setProfile(data);
      setLoading(false);
    };
    fetch();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => fetch());
    return () => subscription.unsubscribe();
  }, []);

  const signOut = () => supabase.auth.signOut();
  return { profile, loading, signOut };
}
