// ============================================================
// lib/utils/schedule.ts — 현장별 월별 점검 종류(월차/분기/반기/연차)
//  · stations.custom_values.schedule = { "1": "월차", …, "12": "월차" }
//  · 없으면 기본 일정: 3·9월 분기, 6월 반기, 11월 연차, 나머지 월차
// ============================================================
export const INSP_TYPES = ['월차', '분기', '반기', '연차'] as const;
export type InspType = (typeof INSP_TYPES)[number];
export type Schedule = Record<string, InspType>;

export const defaultTypeForMonth = (m: number): InspType =>
  m === 6 ? '반기' : m === 11 ? '연차' : (m === 3 || m === 9) ? '분기' : '월차';

export const DEFAULT_SCHEDULE: Schedule = Object.fromEntries(
  Array.from({ length: 12 }, (_, i) => [String(i + 1), defaultTypeForMonth(i + 1)]),
) as Schedule;

// 저장값 정리: 12개월 모두 채우고, 이상한 값은 기본값으로
export function normalizeSchedule(raw: any): Schedule {
  const out = { ...DEFAULT_SCHEDULE };
  if (raw && typeof raw === 'object') {
    for (let m = 1; m <= 12; m++) {
      const v = raw[String(m)];
      if (INSP_TYPES.includes(v)) out[String(m)] = v;
    }
  }
  return out;
}

export const scheduleOf = (station: any): Schedule => normalizeSchedule(station?.custom_values?.schedule);

export const typeForStationMonth = (station: any, m: number): InspType =>
  station?.custom_values?.schedule ? scheduleOf(station)[String(m)] : defaultTypeForMonth(m);

// 목록 표시용 요약: "분기 3·9월, 반기 6월, 연차 11월"
export function scheduleSummary(s: Schedule): string {
  const by: Record<string, number[]> = {};
  for (let m = 1; m <= 12; m++) { const t = s[String(m)]; if (t !== '월차') (by[t] ||= []).push(m); }
  return (['분기', '반기', '연차'] as const).filter((t) => by[t]?.length).map((t) => `${t} ${by[t].join('·')}월`).join(', ') || '매월 월차';
}

export const isDefaultSchedule = (s: Schedule) => Object.keys(DEFAULT_SCHEDULE).every((k) => DEFAULT_SCHEDULE[k] === s[k]);
