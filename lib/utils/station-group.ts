import type { Station, StationGroup } from '@/types';

export function extractBaseName(name: string): string {
  return name.replace(/-\d+$/, '');
}

export function groupStations(stations: Station[]): StationGroup[] {
  const map = new Map<string, StationGroup>();
  for (const s of stations) {
    const key = s.base_name;
    if (!map.has(key)) {
      map.set(key, { base_name: key, unit_count: 0, total_capacity: 0, voltage: s.voltage, station_ids: [], station_names: [] });
    }
    const g = map.get(key)!;
    g.unit_count += 1;
    g.total_capacity += s.capacity ?? 0;
    g.station_ids.push(s.id);
    g.station_names.push(s.name);
  }
  return Array.from(map.values());
}
