'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Station } from '@/types';

export function useStations() {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('stations').select('*').eq('is_active', true).order('base_name');
      setStations(data ?? []);
      setLoading(false);
    };
    fetch();
  }, []);

  return { stations, loading };
}
