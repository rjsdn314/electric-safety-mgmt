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
}

const m = (p: string, pole: number, a: number, remark = '') => br(`${p}MCCB${pole}P${a}A`, remark);
const e = (p: string, pole: number, a: number, remark = '') => br(`${p}ELB${pole}P${a}A`, remark);

// ── 고압(22.9kV) 수전: 변압기 1대 = 저압반(SS) 1면
export const HIGH_TYPES: PresetType[] = [
  { id: 'h600', label: 'TR 600kVA — 파워뱅크 4P700, 디스펜서 4P350', size: 600, canopy: true, spd: 'branch',
    feeders: (p) => [m(p, 4, 700), m(p, 4, 350)] },
  { id: 'h650', label: 'TR 650kVA — PB1~3 3P350, 제어 4P350', size: 650, canopy: true, spd: 'branch',
    feeders: (p) => [m(p, 3, 350), m(p, 3, 350), m(p, 3, 350), m(p, 4, 350)] },
  { id: 'h750', label: 'TR 750kVA — PB1·2 4P700', size: 750, canopy: true, spd: 'branch',
    feeders: (p) => [m(p, 4, 700), m(p, 4, 700)] },
  { id: 'h850', label: 'TR 850kVA — PB1~3 3P350, 제어·디스펜서 4P350', size: 850, canopy: true, spd: 'branch',
    feeders: (p) => [m(p, 3, 350), m(p, 3, 350), m(p, 3, 350), m(p, 4, 350), m(p, 4, 350)] },
  { id: 'h950', label: 'TR 950kVA — PB1·2 4P700, 디스펜서 4P350', size: 950, canopy: true, spd: 'branch',
    feeders: (p) => [m(p, 4, 700), m(p, 4, 700), m(p, 4, 350)] },
  { id: 'h999', label: 'TR 999kVA — PB1 4P700, PB2~4 3P350, 제어 4P350', size: 999, canopy: true, spd: 'branch',
    feeders: (p) => [m(p, 4, 700), m(p, 3, 350), m(p, 3, 350), m(p, 3, 350), m(p, 4, 350)] },
  { id: 'h1100', label: 'TR 1100kVA — 디스펜서1·2 4P350, PB1~3 3P350, 제어 4P350', size: 1100, canopy: true, spd: 'branch',
    feeders: (p) => [m(p, 4, 350), m(p, 4, 350), m(p, 3, 350), m(p, 3, 350), m(p, 3, 350), m(p, 4, 350)] },
];

// ── 저압(380V) 수전: 한전 공급 계통 1개 = 수전 분전함(SS) 1면
export const LOW_TYPES: PresetType[] = [
  { id: 'l210', label: '저압 210kW — 메인 4P350(SPD), 디스펜서 ELB4P350, 캐노피', size: 210, canopy: true, spd: 'main',
    feeders: (p) => [m(p, 4, 350, 'SPD'), e(p, 4, 350)] },
  { id: 'l367', label: '저압 367kW — 메인 4P630(SPD), 파워뱅크 ELB4P630', size: 367, canopy: false, spd: 'main',
    feeders: (p) => [m(p, 4, 630, 'SPD'), e(p, 4, 630)] },
  { id: 'l420', label: '저압 420kW — 메인 4P700(SPD), 디스펜서 ELB4P350×2, 캐노피', size: 420, canopy: true, spd: 'main',
    feeders: (p) => [m(p, 4, 700, 'SPD'), e(p, 4, 350), e(p, 4, 350)] },
  { id: 'l420b', label: '저압 420kW(B) — 메인 4P700, SPD 4P50, 디스펜서 4P350×2, 예비 ELB2P30×2', size: 420, canopy: false, spd: 'none',
    feeders: (p) => [m(p, 4, 700), m(p, 4, 50, 'SPD'), m(p, 4, 350), m(p, 4, 350), e(p, 2, 30, '예비'), e(p, 2, 30, '예비')] },
];

export interface PresetInput {
  low: boolean;                 // 저압 수전 여부
  systems: { typeId: string; spdPoles: 3 | 4 }[];   // 변압기(수전 계통)별 종류
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
    const bs = t.feeders(p);
    if (t.canopy) bs.push(m(p, 4, 50));                       // 캐노피
    if (t.spd === 'branch') bs.push(m(p, sys.spdPoles, 50, 'SPD'));
    panels.push({ name: `SS-${i + 1}`, voltage: '380/220', ground: true, breakers: bs });
    const tr = newTransformer(t.size);
    if (inp.low) tr.volt = '380/220';
    s.transformers.push(tr);
  });
  for (let i = 1; i <= inp.commBoxes; i++) {
    panels.push({ name: `통신함-${i}`, voltage: '380/220', ground: false,
      breakers: [m(p, 4, 50, 'SPD'), ...Array.from({ length: 6 }, () => e(p, 2, 20))] });
  }
  s.panels = panels;
  s.capacity_kw = s.transformers.reduce((n, t) => n + t.kva, 0);
  if (inp.ch200 > 0) s.chargers.push({ kw: 200, count: inp.ch200, model: 'CS20A3' });
  if (inp.ch350 > 0) s.chargers.push({ kw: 350, count: inp.ch350, model: 'AD35A0' });
  s.notes = ['표준 구성으로 채웠습니다. 도면 단선결선도와 비교해 다른 차단기·반 이름·충전기 대수를 고쳐 주세요.'];
  return s;
}
