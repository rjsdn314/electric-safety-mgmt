'use client';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Inspection, InspectionType } from '@/types';

interface Options { limit?: number; type?: InspectionType; }

export function useInspections({ limit = 50, type }: Options = {}) {
  const [inspections, setInspections] = useState<Inspection[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const fetch = async () => {
      let q = supabase.from('inspections')
        .select('*, station:stations(id, base_name, name, voltage, capacity)')
        .order('inspection_date', { ascending: false })
        .limit(limit);
      if (type) q = q.eq('inspection_type', type);
      const { data } = await q;
      setInspections(data ?? []);
      setLoading(false);
    };
    fetch();
  }, [type, limit]);

  return { inspections, loading };
}
