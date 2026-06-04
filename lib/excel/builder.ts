// ============================================================
// lib/excel/builder.ts  (v3)
// 충전소별 전용 양식 지원 + 점검종별 자동 처리 + 별지7/별지2 다중 시트
// 기존 양식 완전 보존, 값만 입력
// ============================================================
import ExcelJS from 'exceljs';

export interface InspectionData {
  station_name: string;
  voltage: string;             // "22900V"
  capacity: string;            // "950KW"
  is_high_voltage: boolean;

  date: string;                // YYYY-MM-DD
  inspection_type: '월차' | '분기' | '반기' | '연차';
  count: number;

  inspector_name: string;
  company_name: string;

  // 별지1 측정값 세트 (수배전반별)
  measure_sets?: Array<{
    voltage_A?: any; voltage_B?: any; voltage_C?: any; voltage_N?: any;
    current_A?: any; current_B?: any; current_C?: any;
    remarks?: string;
  }>;

  // 별지14 충전기 정보 (선택)
  charger_info?: string;
  charger_voltage_capacity?: string;
  charger_maker?: string;
  charger_model?: string;
  insulation_resistance?: string;

  remarks: string;
}

// 별지1 수배전반별 측정값 셀 매핑 (#1, #2, #3 ...)
const PANEL_CELL_MAP: Array<{
  v: { A: string; B: string; C: string; N: string };
  i: { A: string; B: string; C: string };
}> = [
  { v: { A: 'R13', B: 'R14', C: 'R16', N: 'R19' }, i: { A: 'T13', B: 'T14', C: 'T16' } },
  { v: { A: 'R23', B: 'R24', C: 'R26', N: 'R29' }, i: { A: 'T23', B: 'T24', C: 'T26' } },
  { v: { A: 'R33', B: 'R34', C: 'R36', N: 'R39' }, i: { A: 'T33', B: 'T34', C: 'T36' } },
];

// ── 날짜 포맷 헬퍼 ──
function ymd(d: string) {
  const [y, m, day] = d.split('-');
  return {
    yyyy: y,
    yy: y.slice(2),
    m: String(parseInt(m, 10)),       // "9"
    mm: m,                             // "09"
    d: String(parseInt(day, 10)),      // "4"
    dd: day,                           // "04"
    int: parseInt(d.replace(/-/g, '')),// 20250904
  };
}

function toNum(v: any): number | '' {
  return v !== '' && v !== null && v !== undefined ? Number(v) : '';
}

function setCell(ws: ExcelJS.Worksheet, addr: string, value: any) {
  ws.getCell(addr).value = value;
}

// ============================================================
// 날짜 토큰 스캔 치환
// 시트 상단 영역(기본 1~8행)에서 '년/월/일' 토큰을 가진 셀을 찾아
// 기존 표기 형식을 유지하며 선택한 점검일자로 덮어쓴다.
// 별지7·별지2처럼 충전소/시트마다 날짜 위치·형식이 달라도 견고하게 동작.
// 측정 숫자에는 '년/월/일' 글자가 없으므로 안전하게 건너뛴다.
// ============================================================
function replaceDateTokens(ws: ExcelJS.Worksheet, date: string, maxRow = 8) {
  const t = ymd(date);
  for (let r = 1; r <= maxRow; r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell) => {
      const raw = cell.value;
      if (typeof raw !== 'string') return;
      let s = raw;
      const before = s;
      // 4자리 연도 (2025년)
      s = s.replace(/\d{4}\s*년/g, `${t.yyyy}년`);
      // 2자리 연도 (25년) — 4자리에 안 걸린 경우만
      if (s === before) s = s.replace(/(?<!\d)\d{2}\s*년/g, `${t.yy}년`);
      // "9월 04일" 결합형
      s = s.replace(/\d{1,2}\s*월\s*\d{1,2}\s*일/g, `${t.m}월 ${t.dd}일`);
      // 단독 "9월"
      s = s.replace(/(?<!\d)\d{1,2}\s*월(?!\s*\d)/g, `${t.m}월`);
      // 단독 "04일"
      s = s.replace(/(?<!\d)\d{1,2}\s*일/g, `${t.dd}일`);
      if (s !== before) cell.value = s;
    });
  }
}

// ============================================================
// 별지1 — 전기설비 점검결과 기록표
// ============================================================
export function fillByeolji1(ws: ExcelJS.Worksheet, d: InspectionData, opts?: { forceLowVerdicts?: boolean }) {
  const t = ymd(d.date);
  setCell(ws, 'B2', d.station_name);
  setCell(ws, 'T3', d.inspector_name);
  setCell(ws, 'B5', d.voltage);
  setCell(ws, 'D5', d.capacity);
  setCell(ws, 'B6', t.int);
  setCell(ws, 'H6', d.inspection_type);   // 점검종별 (F6:G6 = 라벨 병합 → 값은 H6)
  setCell(ws, 'J6', d.count || 1);

  const sets = d.measure_sets && d.measure_sets.length ? d.measure_sets : [];
  sets.forEach((set, idx) => {
    const map = PANEL_CELL_MAP[idx];
    if (!map) return;
    setCell(ws, map.v.A, toNum(set.voltage_A));
    setCell(ws, map.v.B, toNum(set.voltage_B));
    setCell(ws, map.v.C, toNum(set.voltage_C));
    setCell(ws, map.v.N, toNum(set.voltage_N));
    setCell(ws, map.i.A, toNum(set.current_A));
    setCell(ws, map.i.B, toNum(set.current_B));
    setCell(ws, map.i.C, toNum(set.current_C));
  });

  const panelRemarks =
    sets.map((s, i) => (s.remarks ? `#${i + 1}: ${s.remarks}` : '')).filter(Boolean).join(' / ') ||
    d.remarks || '특이사항없음';
  setCell(ws, 'A50', panelRemarks);

  // 저압 설비 판정 강제 입력 — 공용 저압 템플릿(월차)에서만 사용.
  // 충전소별 등록 양식은 이미 판정이 채워져 있으므로 건드리지 않는다.
  if (opts?.forceLowVerdicts && !d.is_high_voltage) {
    const O = '\u25CB', X = '/';
    const v: Record<string, string> = {
      C13: O, C14: O, C15: O, C16: O, C17: O, C18: O, C19: O, C20: O, C21: O,
      C22: O, C23: O, C24: O, C25: O, C26: O, C27: X, C28: X, C29: O, C30: O,
      C31: X, C32: X, C33: X, C34: X, C35: X, C36: O, C37: O, C38: X, C39: X,
      C40: O, C41: O, C42: X, C43: X, C44: X, C45: X, C46: X,
    };
    for (const [addr, mark] of Object.entries(v)) setCell(ws, addr, mark);
  }
}

// ============================================================
// 별지14 — 전기자동차 충전시설 점검기록표
// ============================================================
export function fillByeolji14(ws: ExcelJS.Worksheet, d: InspectionData) {
  const t = ymd(d.date);
  setCell(ws, 'G4', `${t.yy}년${t.mm}월${t.dd}일`);

  // C5(점검자/소속): 회사명이 주어진 경우에만 새로 작성.
  // 등록 양식에 이미 소속이 인쇄돼 있으면 보존하기 위해 비어있을 때만 점검자 보강.
  if (d.company_name) {
    setCell(ws, 'C5',
      `(소 속)${d.company_name}/                                          (성 명)   ${d.inspector_name}            (서명)`);
  } else {
    const cur = ws.getCell('C5').value;
    if (cur === null || cur === undefined || String(cur).trim() === '') {
      setCell(ws, 'C5', d.inspector_name);
    }
  }
  setCell(ws, 'C7', d.station_name);

  const vNum = parseInt(d.voltage.replace(/[^0-9]/g, '') || '0', 10);
  const cNum = d.capacity.replace(/[^0-9]/g, '');
  setCell(ws, 'C8', d.is_high_voltage
    ? `${vNum.toLocaleString()}[V] / ${cNum}[㎾]`
    : `${vNum}[V]/ ${cNum}[㎾]`);

  if (d.charger_info) setCell(ws, 'C9', d.charger_info);
  if (d.charger_voltage_capacity) setCell(ws, 'E12', d.charger_voltage_capacity);
  if (d.charger_maker) setCell(ws, 'E13', d.charger_maker);
  if (d.charger_model) setCell(ws, 'H13', d.charger_model);
  if (d.insulation_resistance) setCell(ws, 'K36', d.insulation_resistance);
  setCell(ws, 'C38', d.remarks || '특이사항없음');
}

// ============================================================
// 별지7 — 적외선 열화상분포 측정기록표 (파일 내 여러 개 가능)
// 날짜: AC3(년)·AE3(월)·AI3(일) 고정 + 토큰 스캔 보강
// 점검종별은 제목에 인쇄돼 있어 별도 표기 없음(글자 기입식 방침)
// ============================================================
export function fillByeolji7(ws: ExcelJS.Worksheet, d: InspectionData) {
  const t = ymd(d.date);
  setCell(ws, 'AC3', `${t.yy}년`);
  setCell(ws, 'AE3', parseInt(t.m, 10));
  setCell(ws, 'AI3', parseInt(t.d, 10));
  replaceDateTokens(ws, d.date, 5);
}

// ============================================================
// 별지2 — 절연저항 / 접지저항 (파일 내 여러 개 가능)
// 날짜 위치·연도표기가 시트/충전소마다 달라 토큰 스캔 치환으로 처리.
// 측정값 셀은 충전소별 고정 매핑 단계(다음 버전)에서 입력 — v1은 날짜만 자동 반영.
// ============================================================
export function fillByeolji2(ws: ExcelJS.Worksheet, d: InspectionData) {
  replaceDateTokens(ws, d.date, 6);
}

// ============================================================
// 워크북 전체 채우기 — 시트명으로 분기, 다중 시트 모두 처리
// ============================================================
export function fillWorkbook(
  wb: ExcelJS.Workbook,
  d: InspectionData,
  opts?: { forceLowVerdicts?: boolean; replaceNames?: string[] }
) {
  for (const ws of wb.worksheets) {
    const name = ws.name || '';
    const isB14 = name.includes('별지14');
    const isB1 = name.includes('별지1') && !isB14;
    const isB7 = name.includes('별지7');
    const isB2 = name.includes('별지2'); // 절연/접지 포함

    if (isB1) fillByeolji1(ws, d, opts);
    else if (isB14) fillByeolji14(ws, d);
    else if (isB7) fillByeolji7(ws, d);     // 모든 별지7에 동일 적용
    else if (isB2) fillByeolji2(ws, d);     // 모든 별지2에 동일 적용
  }

  // 양식에 인쇄된 기존 안전관리자명 → 로그인 계정명 치환 (모든 시트의 문자열 셀)
  const names = opts?.replaceNames || [];
  const repl = d.inspector_name || '';
  if (repl && names.length) {
    for (const ws of wb.worksheets) {
      ws.eachRow({ includeEmpty: false }, (row) => {
        row.eachCell({ includeEmpty: false }, (cell) => {
          if (typeof cell.value === 'string') {
            let s = cell.value;
            for (const nm of names) { if (nm) s = s.split(nm).join(repl); }
            if (s !== cell.value) cell.value = s;
          }
        });
      });
    }
  }
}

export async function buildInspectionExcel(
  data: InspectionData,
  templateBuffer: ArrayBuffer,
  opts?: { forceLowVerdicts?: boolean }
): Promise<{ buffer: Buffer; fileName: string }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(templateBuffer);
  fillWorkbook(wb, data, opts);
  const out = await wb.xlsx.writeBuffer();
  const dateNum = data.date.replace(/-/g, '');
  const fileName = `${data.station_name}_${data.inspection_type}점검_${dateNum}.xlsx`;
  return { buffer: Buffer.from(out), fileName };
}
