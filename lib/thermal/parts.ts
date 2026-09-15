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

// 흔한 수배전반 부위의 기본 특징 — 현장별 부위에 새 이름(VCB 등)을 넣었을 때 AI 설명으로 사용
export const KNOWN_PART_DESC: Record<string, string> = {
  PF: DEFAULT_PARTS[0].desc,
  PT: DEFAULT_PARTS[1].desc,
  CH: DEFAULT_PARTS[2].desc,
  VCB: '진공차단기: 빨간색/적갈색 주름 애자(부싱)가 위아래로 달린 인출형 차단기 몸체, 금속 프레임 안에 3상 나란히',
  LBS: '부하개폐기: 3상 나란히 선 애자와 개폐 칼날·조작 링크, 전력퓨즈가 함께 달린 경우가 많음',
  MOF: '계기용변성기(MOF): 네모난 금속 탱크 또는 몰드형 몸체에 고압 단자와 명판',
  TR: '변압기: 큰 몰드/유입 변압기 몸체, 방열판과 고압·저압 단자',
  LA: '피뢰기: 검정/회색 주름 원통형 애자, 윗단자에 전선, 아래쪽 접지선',
  COS: '컷아웃스위치: 비스듬히 달린 퓨즈 홀더와 애자',
  ACB: '기중차단기: 전면 조작부가 있는 큰 사각 차단기와 뒤쪽 부스바',
  MCCB: '배선용차단기: 사각 몰드 차단기 몸체, 전면 레버와 단자 볼트',
};

const partKey = (s: string) => s.replace(/\s+/g, '').toUpperCase();

// 부위 설명: 계정 부위 목록에 같은 이름이 있으면 그 설명, 없으면 기본 특징
export function describePart(name: string, accountParts: ThermalPart[] = DEFAULT_PARTS): string {
  const key = partKey(name);
  return accountParts.find((p) => partKey(p.name) === key)?.desc || KNOWN_PART_DESC[key] || '';
}

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
