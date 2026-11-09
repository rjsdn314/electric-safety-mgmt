// ============================================================
// lib/annual/presets.ts
// 표준 구성 프리셋 — AI(크레딧) 없이 도면에서 읽은 대표 결선을 바로 채운다.
//  · 휴게소 충전소 도면(단선결선도 E-002 / 저압 수전 분전함 결선도)을 직접 판독해 정리한 간선 구성
//  · 사용자는 도면을 옆에 띄워 놓고 변압기(수전 계통) 종류만 고르면 분전반·차단기가 채워지고, 다른 부분만 고친다.
// ============================================================
import { AnnualSpec, Breaker, Panel, emptySpec, newTransformer, breakerDefaults } from './spec';

const br = (spec: string, remark = ''): Breaker => ({ spec, ...breakerDefaults(spec), remark });

export interface PresetType {
  id: string;
  label: string;        // 화면 표시
  size: number;         // 고압: 변압기 kVA / 저압: 수전 kW
  feeders: (p: string) => Breaker[];   // p = 차단기 앞 번호(예: '2')
  canopy: boolean;      // 캐노피 4P50A 간선 포함 여부
  spd: 'branch' | 'main' | 'none';     // SPD: 별도 MCCB 간선 / 메인 차단기 비고 / 없음
  ch: [number, number];  // 추정 충전기 대수 [200kW, 350kW] (기존 양식들 기준)
}

const m = (p: string, pole: number, a: number, remark = '') => br(`${p}MCCB${pole}P${a}A`, remark);
const e = (p: string, pole: number, a: number, remark = '') => br(`${p}ELB${pole}P${a}A`, remark);

// ── 고압(22.9kV) 수전: 변압기 1대 = 저압반(SS) 1면
export const HIGH_TYPES: PresetType[] = [
  { id: 'h600', label: 'TR 600kVA — 파워뱅크 4P700, 디스펜서 4P350', size: 600, canopy: true, spd: 'branch', ch: [1, 1],
    feeders: (p) => [m(p, 4, 700), m(p, 4, 350)] },
  { id: 'h650', label: 'TR 650kVA — PB1~3 3P350, 제어 4P350', size: 650, canopy: true, spd: 'branch', ch: [0, 3],
    feeders: (p) => [m(p, 3, 350), m(p, 3, 350), m(p, 3, 350), m(p, 4, 350)] },
  { id: 'h750', label: 'TR 750kVA — PB1·2 4P700', size: 750, canopy: true, spd: 'branch', ch: [0, 2],
    feeders: (p) => [m(p, 4, 700), m(p, 4, 700)] },
  { id: 'h850', label: 'TR 850kVA — PB1~3 3P350, 제어·디스펜서 4P350', size: 850, canopy: true, spd: 'branch', ch: [1, 3],
    feeders: (p) => [m(p, 3, 350), m(p, 3, 350), m(p, 3, 350), m(p, 4, 350), m(p, 4, 350)] },
  { id: 'h950', label: 'TR 950kVA — PB1·2 4P700, 디스펜서 4P350', size: 950, canopy: true, spd: 'branch', ch: [1, 2],
    feeders: (p) => [m(p, 4, 700), m(p, 4, 700), m(p, 4, 350)] },
  { id: 'h999', label: 'TR 999kVA — PB1 4P700, PB2~4 3P350, 제어 4P350', size: 999, canopy: true, spd: 'branch', ch: [0, 4],
    feeders: (p) => [m(p, 4, 700), m(p, 3, 350), m(p, 3, 350), m(p, 3, 350), m(p, 4, 350)] },
  { id: 'h1100', label: 'TR 1100kVA — 디스펜서1·2 4P350, PB1~3 3P350, 제어 4P350', size: 1100, canopy: true, spd: 'branch', ch: [2, 3],
    feeders: (p) => [m(p, 4, 350), m(p, 4, 350), m(p, 3, 350), m(p, 3, 350), m(p, 3, 350), m(p, 4, 350)] },
];

// ── 저압(380V) 수전: 한전 공급 계통 1개 = 수전 분전함(SS) 1면
export const LOW_TYPES: PresetType[] = [
  { id: 'l210', label: '저압 210kW — 메인 4P350(SPD), 디스펜서 ELB4P350, 캐노피', size: 210, canopy: true, spd: 'main', ch: [1, 0],
    feeders: (p) => [m(p, 4, 350, 'SPD'), e(p, 4, 350)] },
  { id: 'l367', label: '저압 367kW — 메인 4P630(SPD), 파워뱅크 ELB4P630', size: 367, canopy: false, spd: 'main', ch: [0, 1],
    feeders: (p) => [m(p, 4, 630, 'SPD'), e(p, 4, 630)] },
  { id: 'l420', label: '저압 420kW — 메인 4P700(SPD), 디스펜서 ELB4P350×2, 캐노피', size: 420, canopy: true, spd: 'main', ch: [2, 0],
    feeders: (p) => [m(p, 4, 700, 'SPD'), e(p, 4, 350), e(p, 4, 350)] },
  { id: 'l420b', label: '저압 420kW(B) — 메인 4P700, SPD 4P50, 디스펜서 4P350×2, 예비 ELB2P30×2', size: 420, canopy: false, spd: 'none', ch: [2, 0],
    feeders: (p) => [m(p, 4, 700), m(p, 4, 50, 'SPD'), m(p, 4, 350), m(p, 4, 350), e(p, 2, 30, '예비'), e(p, 2, 30, '예비')] },
];

export interface PresetInput {
  low: boolean;                 // 저압 수전 여부
  systems: { typeId: string; spdPoles: 3 | 4; feeders?: Breaker[]; size?: number }[];   // 변압기(수전 계통)별 종류 · feeders=도면에서 읽은 간선(있으면 표준 대신 사용)
  commBoxes: number;            // 통신함 수
  ch200: number;                // 200kW 충전기 대수
  ch350: number;                // 350kW 충전기 대수
  prefix: string;               // 차단기 앞 번호
  stationLabel: string;
}

export function buildPresetSpec(inp: PresetInput): AnnualSpec {
  const types = inp.low ? LOW_TYPES : HIGH_TYPES;
  const p = inp.prefix || '';
  const s = emptySpec();
  s.station_label = inp.stationLabel;
  s.supply_voltage = inp.low ? 380 : 22900;
  const panels: Panel[] = [];
  inp.systems.forEach((sys, i) => {
    const t = types.find((x) => x.id === sys.typeId) || types[0];
    let bs: Breaker[];
    if (sys.feeders?.length) {
      bs = sys.feeders.map((b) => ({ ...b }));                // 도면 간선표(캐노피 포함)
    } else {
      bs = t.feeders(p);
      if (t.canopy) bs.push(m(p, 4, 50));                     // 캐노피
    }
    if (t.spd === 'branch') bs.push({ ...m(p, sys.spdPoles, 50, 'SPD'), check: 'SPD 차단기 3P/4P — 도면 확인' });
    const panelCheck = inp.low ? '저압 분전함 표준 구성 — 도면의 ELB·MCCB와 비교'
      : sys.feeders?.length ? undefined : '표준 구성으로 채움 — 도면 간선표와 비교';
    panels.push({ name: `SS-${i + 1}`, voltage: '380/220', ground: true, breakers: bs, ...(panelCheck ? { check: panelCheck } : {}) });
    const tr = newTransformer(sys.size || t.size);
    if (inp.low) tr.volt = '380/220';
    s.transformers.push(tr);
  });
  for (let i = 1; i <= inp.commBoxes; i++) {
    panels.push({ name: `통신함-${i}`, voltage: '380/220', ground: false, check: '통신함 개수·차단기는 추정 — 현장 확인',
      breakers: [m(p, 4, 50, 'SPD'), ...Array.from({ length: 6 }, () => e(p, 2, 20))] });
  }
  s.panels = panels;
  s.capacity_kw = s.transformers.reduce((n, t) => n + t.kva, 0);
  const chk = '추정 대수 — 실제 충전기 수 확인';
  if (inp.ch200 > 0) s.chargers.push({ kw: 200, count: inp.ch200, model: 'CS20A3', check: chk });
  if (inp.ch350 > 0) s.chargers.push({ kw: 350, count: inp.ch350, model: 'AD35A0', check: chk });
  if (!inp.low) s.check_hv = '기본 구간(책임2차~ASS1차, ASS2차~TR1차) — 변압기 수·현장 구간에 맞게 확인';
  s.notes = ['표준 구성으로 채웠습니다. 도면 단선결선도와 비교해 다른 차단기·반 이름·충전기 대수를 고쳐 주세요.'];
  return s;
}

// 용량(kVA·kW)에 가장 가까운 표준 종류
export function typeForSize(low: boolean, size: number): PresetType {
  const types = low ? LOW_TYPES : HIGH_TYPES;
  return types.reduce((a, t) => (Math.abs(t.size - size) < Math.abs(a.size - size) ? t : a), types[0]);
}

// 선택한 종류들로 충전기 대수 추정 [200kW, 350kW]
export function estimateChargers(low: boolean, typeIds: string[]): [number, number] {
  const types = low ? LOW_TYPES : HIGH_TYPES;
  return typeIds.reduce<[number, number]>((n, id) => {
    const t = types.find((x) => x.id === id);
    return t ? [n[0] + t.ch[0], n[1] + t.ch[1]] : n;
  }, [0, 0]);
}
