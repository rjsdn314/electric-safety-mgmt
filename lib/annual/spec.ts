// ============================================================
// lib/annual/spec.ts
// 도면 → 연차점검 양식: 현장 설비 사양(AnnualSpec) 타입·기본값
//  · AI가 도면(PDF)에서 뽑은 설비 목록을 이 형태로 받고, 화면에서 사용자가 검토·수정한다.
//  · lib/excel/annualBuild.ts 가 이 사양으로 고압 연차 기본틀(public/templates/annual_base_high.xlsx)을 채운다.
// ============================================================

export type Mark = '○' | '/';

export interface Breaker {
  spec: string;      // 예: 2MCCB4P350A
  voltage: string;   // 사용전압: 380/220, 220 ...
  value: string;     // 절연저항(㏁)/누설전류 기본값: 999(MCCB) / 11(ELB)
  remark: string;    // 비고: SPD 등
}

export interface Panel {
  name: string;          // SS-1, 통신함-1, 분전함-1 ...
  voltage: string;       // 접지저항 표 사용전압 (380/220)
  ground: boolean;       // 접지저항 측정 대상(별지2-접지저항에 행 생성)
  breakers: Breaker[];
}

export interface GroundRow { wire: string; standard: string; value: string }

export interface Transformer {
  kva: number;           // 850
  phase: string;         // 3￠
  volt: string;          // 22.9/380
  maker: string;         // 경동
  serial: string;        // 제작번호
  oil: string;           // 변압기점검 K열(유량)
  location: string;      // 설치장소: 큐비클
  max_kw: string;        // 전원품질 최대전력
  pf: string;            // 전원품질 역률
  ground: GroundRow[];   // 고압 접지저항 표 8행(개폐기·피뢰기·MOF·변압기·차단기·철구·제2종·울타리)
}

export interface HvCircuit {
  name: string; insul: string; ab: string; bc: string; ca: string; result: string; remark: string;
}

export interface ChargerGroup { kw: number; count: number; model: string }

export interface AnnualSpec {
  station_label: string;        // 설비명(상호)
  supply_voltage: number;       // 수전전압 V (22900)
  capacity_kw: number;          // 수전용량 kW
  marks_low: Record<string, Mark>;   // 별지1 저압설비 판정(○/ /)
  marks_high: Record<string, Mark>;  // 별지1 특고(고압)설비 판정
  transformers: Transformer[];
  panels: Panel[];
  hv_circuits: HvCircuit[];
  chargers: ChargerGroup[];
  charger_maker: string;
  charger_location: '옥내' | '옥외' | '기타';
  charger_types: { chademo: boolean; combo: boolean; ac3: boolean };
  notes: string[];               // AI가 확신하지 못한 부분 등 안내
}

// 별지1 판정 셀 위치 (병합 앵커). 라벨 = 양식 표기
export const LOW_ITEMS: Array<{ key: string; row: number }> = [
  { key: '인입구 배선', row: 13 }, { key: '배·분전반', row: 15 }, { key: '배선용 차단기', row: 17 },
  { key: '누전차단기', row: 20 }, { key: '개폐기', row: 22 }, { key: '배선', row: 24 },
  { key: '전동기', row: 27 }, { key: '전열설비', row: 29 }, { key: '용접기', row: 31 },
  { key: '커패시터', row: 34 }, { key: '조명설비', row: 36 }, { key: '구내전선로', row: 38 },
  { key: '기타설비', row: 40 }, { key: '발전기', row: 42 }, { key: '차단장치', row: 44 },
  { key: '축전장치', row: 45 },
];
export const HIGH_ITEMS: Array<{ key: string; row: number }> = [
  { key: '가공전선로', row: 13 }, { key: '지중전선로', row: 14 }, { key: '수배전용개폐기', row: 16 },
  { key: '배선(모선)', row: 18 }, { key: '피뢰기', row: 21 }, { key: '변성기', row: 25 },
  { key: '전력퓨즈', row: 28 }, { key: '변압기', row: 30 }, { key: '수·배전반', row: 32 },
  { key: '계전기류', row: 33 }, { key: '차단기류', row: 35 }, { key: '전력용커패시터', row: 37 },
  { key: '보호설비', row: 39 }, { key: '부하설비', row: 41 }, { key: '접지시설', row: 43 },
  { key: '기타설비', row: 46 },
];

// 기본 판정 (고압 수전 충전소 기준 — 내린천 연차 양식 값)
const DEFAULT_LOW_OFF = new Set(['전동기', '용접기', '커패시터', '구내전선로', '발전기', '차단장치', '축전장치']);
const DEFAULT_HIGH_OFF = new Set(['지중전선로']);
export function defaultMarksLow(): Record<string, Mark> {
  return Object.fromEntries(LOW_ITEMS.map((i) => [i.key, DEFAULT_LOW_OFF.has(i.key) ? '/' : '○'])) as Record<string, Mark>;
}
export function defaultMarksHigh(): Record<string, Mark> {
  return Object.fromEntries(HIGH_ITEMS.map((i) => [i.key, DEFAULT_HIGH_OFF.has(i.key) ? '/' : '○'])) as Record<string, Mark>;
}

export const GROUND_ITEMS = ['개폐기', '피뢰기', 'MOF 외함', '변압기 외함', '차단기 외함', '철구 및 가공지선', '제2종 접지', '보호 울타리'];
export function defaultGroundRows(): GroundRow[] {
  // 내린천 양식 기준: 접지선 F-GV35SQ(변압기 외함·제2종은 95SQ), 기준치 10Ω(제2종 5Ω)
  return GROUND_ITEMS.map((_, i) => ({
    wire: i === 3 || i === 6 ? 'F-GV95SQ' : 'F-GV35SQ',
    standard: i === 6 ? '5' : '10',
    value: '',
  }));
}

export function newTransformer(kva = 0): Transformer {
  return {
    kva, phase: '3￠', volt: '22.9/380', maker: '', serial: '', oil: '', location: '큐비클',
    max_kw: '', pf: '', ground: defaultGroundRows(),
  };
}

export function defaultHvCircuits(): HvCircuit[] {
  return [
    { name: '책임2차~ASS1차', insul: '-', ab: '-', bc: '-', ca: '-', result: '-', remark: '책임미개방' },
    { name: 'ASS2차~TR1차', insul: '2000', ab: '0', bc: '0', ca: '0', result: '적 합', remark: 'MOF포함' },
  ];
}

// 차단기 종류 → 기본 사용전압/측정치
export function breakerDefaults(spec: string): { voltage: string; value: string } {
  if (!/ELB/i.test(spec)) return { voltage: '380/220', value: '999' };
  // 3·4극 누전차단기(저압 수전 현장의 디스펜서·파워뱅크 간선)는 3상 380/220
  return { voltage: /ELB\D*[34]P/i.test(spec) ? '380/220' : '220', value: '11' };
}

// 저압 수전(380V) 현장: 변압기가 없고 한전 공급 계통(수전 분전함)별로 측정한다.
//  transformers[].kva 에 계통별 수전용량(kW)을 넣어 쓴다 (별지7·전원품질·측정개소가 계통 수만큼 생김)
export const isLowVoltage = (sp: Pick<AnnualSpec, 'supply_voltage'>) => sp.supply_voltage > 0 && sp.supply_voltage < 1000;

export function emptySpec(): AnnualSpec {
  return {
    station_label: '', supply_voltage: 22900, capacity_kw: 0,
    marks_low: defaultMarksLow(), marks_high: defaultMarksHigh(),
    transformers: [], panels: [], hv_circuits: defaultHvCircuits(),
    chargers: [], charger_maker: 'SK시그넷', charger_location: '옥외',
    charger_types: { chademo: false, combo: true, ac3: false },
    notes: [],
  };
}

// 양식 한계 (기본틀 구조상)
export const LIMITS = {
  transformers: 3,     // 별지1 측정개소 3칸 · 전원품질 3블록 · 변압기점검 3행
  hvCircuits: 11,      // 고압 기기절연 표 8~18행
  insulPages: 8,       // 별지2-절연저항 페이지 수
};
