'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface Options { limit?: number; type?: string; }

export function useInspections({ limit = 50, type }: Options = {}) {
  const [inspections, setInspections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient();
      let q = supabase.from('inspections')
        .select('*')
        .order('inspection_date', { ascending: false })
        .limit(limit);
      if (type) q = q.eq('inspection_type', type);
      
      const { data: insps, error } = await q;
      if (error) {
        console.error('점검 조회 오류:', error);
        setLoading(false);
        return;
      }

      if (insps && insps.length > 0) {
        const stationIds = [...new Set(insps.map(i => i.station_id))];
        const { data: stations } = await supabase
          .from('stations')
          .select('id, base_name, name, voltage, capacity')
          .in('id', stationIds);
        
        const stationMap = new Map(stations?.map(s => [s.id, s]) || []);
        const merged = insps.map(i => ({
          ...i,
          station: stationMap.get(i.station_id)
        }));
        setInspections(merged);
      } else {
        setInspections([]);
      }
      
      setLoading(false);
    };
    fetchData();
  }, [type, limit]);

  return { inspections, loading };
}