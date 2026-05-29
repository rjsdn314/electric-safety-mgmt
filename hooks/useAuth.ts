'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useAuth() {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const supabase = createClient();
    
    const fetchProfile = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          if (mounted) setLoading(false);
          return;
        }
        
        // sectors 조인 없이 단순하게
        const { data: profileData } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        
        if (!mounted) return;
        
        // sector 정보는 따로 가져오기
        if (profileData?.sector_id) {
          const { data: sectorData } = await supabase
            .from('sectors')
            .select('*')
            .eq('id', profileData.sector_id)
            .single();
          
          if (mounted) {
            setProfile({ ...profileData, sector: sectorData });
          }
        } else {
          if (mounted) setProfile(profileData);
        }
      } catch(e) {
        console.error('프로필 조회 오류:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    
    fetchProfile();
    
    return () => {
      mounted = false;
    };
  }, []);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
  };
  
  return { profile, loading, signOut };
}