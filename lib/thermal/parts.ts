// ============================================================
// lib/thermal/parts.ts
// 계정별 열화상 촬영 부위 목록 (서버·브라우저 공용)
//  · 사람마다 찍는 부위가 달라 계정마다 부위 이름·특징·순서를 설정한다.
//  · 순서 = 별지7 측정 행(13/15/17) 기본 순서. 양식 라벨(PF/PT/CH/인입 등)과 이름이 같으면 라벨 위치를 우선한다.
// ============================================================

export interface ThermalPart {
  name: string;   // 엑셀 라벨과 맞출 짧은 이름 (예: PF, PT, CH, 인입, MCCB)
  desc: string;   // AI에게 알려줄 사진상 특징
}

export const DEFAULT_PARTS: ThermalPart[] = [
  { name: 'PF', desc: '전력퓨즈: 갈색/적갈색 또는 베이지색의 긴 원통형 퓨즈, 노란색·흰색 정격 라벨, 클립 사이에 가로 또는 세로로 장착' },
  { name: 'PT', desc: '계기용변압기: 검정/짙은색 에폭시 몰드 변압기 몸체, 주름진 애자와 위쪽의 작은 단자, 네모난 형태' },
  { name: 'CH', desc: '케이블헤드: 검정 고압케이블 끝의 흰색/회색 주름(갓) 스트레스콘 종단부가 부스바 러그에 연결, 보통 3개가 나란히' },
];

export const MAX_PARTS = 6;

// 입력 정리: 이름 앞뒤 공백 제거, 빈 이름·중복 제거, 길이 제한, 최대 개수 제한
export function sanitizeParts(input: unknown): ThermalPart[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: ThermalPart[] = [];
  for (const raw of input) {
    const name = String((raw as any)?.name ?? '').trim().slice(0, 20);
    const desc = String((raw as any)?.desc ?? '').trim().slice(0, 300);
    const key = name.replace(/\s+/g, '').toUpperCase();
    if (!name || seen.has(key) || key === 'UNKNOWN') continue;
    seen.add(key);
    out.push({ name, desc });
    if (out.length >= MAX_PARTS) break;
  }
  return out;
}
