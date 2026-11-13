// ============================================================
// lib/utils/kepco.ts
// 한전 고객번호(전기사용 고객번호, 10자리) — 충전소 하나에 여러 개(계약·변압기별) 가능
//  · 저장 형식: ['13-2800-3038', ...]  (stations.custom_values.kepco_nos)
//  · 입력: 쉼표·줄바꿈·공백으로 구분, 하이픈 유무 상관없음. 엑셀에서 앞자리 0이 빠진 9자리도 보정
// ============================================================
export const KEPCO_ON_URL = 'https://online.kepco.co.kr/';

export function formatKepco(raw: string): string | null {
  const d = String(raw || '').replace(/\D/g, '');
  if (!d) return null;
  const ten = d.length < 10 ? d.padStart(10, '0') : d;
  if (ten.length !== 10) return null;
  return `${ten.slice(0, 2)}-${ten.slice(2, 6)}-${ten.slice(6)}`;
}

export function parseKepcoList(input: unknown): string[] {
  const parts = Array.isArray(input) ? input.map(String) : String(input ?? '').split(/[,\n;/]+|\s{2,}/);
  const out: string[] = [];
  for (const p of parts) {
    const f = formatKepco(p.trim());
    if (f && !out.includes(f)) out.push(f);
  }
  return out;
}

export const kepcoOf = (st: any): string[] => {
  const v = st?.custom_values?.kepco_nos;
  return Array.isArray(v) ? v : [];
};
