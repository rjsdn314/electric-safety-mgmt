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
      const supabase = createClient();
      const { data, error } = await supabase
        .from('stations')
        .select('*')
        .eq('is_active', true)
        .order('name');
      
      if (error) {
        console.error('충전소 로딩 오류:', error);
      }
      setStations(data ?? []);
      setLoading(false);
    };
    fetchStations();
  }, []);

  return { stations, loading };
}