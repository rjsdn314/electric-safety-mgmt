'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export interface Station {
  id: string;
  name: string;
  base_name: string;
  voltage: number;
  capacity: number;
  sector_id: string;
  address: string;
  is_active: boolean;
}

export function useStations() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStations = async () => {
      try {
        const supabase = createClient();
        console.log('충전소 로딩 시작...');
        const { data, error } = await supabase
          .from('stations')
          .select('*')
          .eq('is_active', true)
          .order('name');
        
        if (error) {
          console.error('충전소 로딩 오류:', error.message);
        } else {
          console.log('충전소 로딩 성공:', data?.length, '개');
        }
        setStations(data ?? []);
      } catch(e) {
        console.error('예외 발생:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchStations();
  }, []);

  return { stations, loading };
}