// ============================================================
// lib/excel/xmlFill.ts
// 점검표 생성 엔진 — 원본 xlsx의 XML에서 "값만" 직접 교체한다.
// ExcelJS로 다시 저장하지 않으므로 테두리/서식(셀의 s= 스타일)이 100% 보존된다.
// 입력 템플릿은 normalize.ts로 네임스페이스가 표준화된(=x: 프리픽스 없는) 상태를 가정.
// ============================================================
import JSZip from 'jszip';

export interface FillData {
  station_name: string;
  voltage: string;             // "22900V"
  capacity: string;            // "950KW"
  is_high_voltage: boolean;
  date: string;                // YYYY-MM-DD
  inspection_type: '월차' | '분기' | '반기' | '연차';
  count: number;
  inspector_name: string;
  company_name?: string;
  measure_sets?: Array<{
    voltage_A?: any; voltage_B?: any; voltage_C?: any; voltage_N?: any;
    current_A?: any; current_B?: any; current_C?: any; remarks?: string;
  }>;
  ground_resistance?: any[];   // 접지저항 측정값 (별지2-접지저항 D5↓)
  replace_names?: string[];     // 양식에 인쇄된 기존 안전관리자명 → inspector_name 으로 치환
  remarks: string;
}

const PANEL = [
  { v: { A: 'R13', B: 'R14', C: 'R16', N: 'R19' }, i: { A: 'T13', B: 'T14', C: 'T16' } },
  { v: { A: 'R23', B: 'R24', C: 'R26', N: 'R29' }, i: { A: 'T23', B: 'T24', C: 'T26' } },
  { v: { A: 'R33', B: 'R34', C: 'R36', N: 'R39' }, i: { A: 'T33', B: 'T34', C: 'T36' } },
];

function ymd(d: string) {
  const [y, m, day] = d.split('-');
  return { yyyy: y, yy: y.slice(2), m: String(+m), mm: m, d: String(+day), dd: day, int: +d.replace(/-/g, '') };
}
function xmlEsc(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function colToNum(col: string) { let n = 0; for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
function refParts(ref: string) { const m = ref.match(/^([A-Z]+)(\d+)$/)!; return { col: m[1], colN: colToNum(m[1]), row: +m[2] }; }

// ── 셀 하나의 값을 교체(없으면 삽입). 기존 s= 스타일 보존 ──
function setCell(xml: string, ref: string, value: any, isNum: boolean): string {
  const { row } = refParts(ref);
  const cellRe = new RegExp(`<c r="${ref}"([^>]*?)(/>|>[\\s\\S]*?</c>)`);
  const inner = isNum
    ? `<v>${value}</v>`
    : `<is><t xml:space="preserve">${xmlEsc(value)}</t></is>`;
  const m = xml.match(cellRe);
  if (m) {
    const attrs = m[1];
    const sMatch = attrs.match(/\ss="\d+"/);
    const s = sMatch ? sMatch[0] : '';
    const t = isNum ? '' : ' t="inlineStr"';
    return xml.replace(cellRe, `<c r="${ref}"${s}${t}>${inner}</c>`);
  }
  // 셀이 없으면 해당 행에 컬럼 순서로 삽입
  const newCell = `<c r="${ref}"${isNum ? '' : ' t="inlineStr"'}>${inner}</c>`;
  const rowRe = new RegExp(`(<row r="${row}"[^>]*>)([\\s\\S]*?)(</row>)`);
  const rm = xml.match(rowRe);
  if (rm) {
    const cells = rm[2];
    const targetN = refParts(ref).colN;
    // 기존 셀들의 위치를 보고 삽입 지점 결정
    const cellTags = [...cells.matchAll(/<c r="([A-Z]+\d+)"[\s\S]*?(?:\/>|<\/c>)/g)];
    let insertAt = cells.length;
    for (const ct of cellTags) {
      if (refParts(ct[1]).colN > targetN) { insertAt = ct.index!; break; }
    }
    const newCells = cells.slice(0, insertAt) + newCell + cells.slice(insertAt);
    return xml.replace(rowRe, `${rm[1]}${newCells}${rm[3]}`);
  }
  // 행 자체가 없으면 sheetData에 행 순서로 삽입
  const newRow = `<row r="${row}">${newCell}</row>`;
  const rowTags = [...xml.matchAll(/<row r="(\d+)"/g)];
  let insertPos = -1;
  for (const rt of rowTags) { if (+rt[1] > row) { insertPos = rt.index!; break; } }
  if (insertPos >= 0) return xml.slice(0, insertPos) + newRow + xml.slice(insertPos);
  return xml.replace(/<\/sheetData>/, `${newRow}</sheetData>`);
}

// ── sharedStrings 파싱 (인덱스→텍스트) ──
function parseShared(ss: string): string[] {
  const out: string[] = [];
  for (const si of ss.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    const texts = [...si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map(t => t[1]);
    out.push(texts.join('')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
  }
  return out;
}

// ── 상단 영역 날짜 토큰 치환 (위치/연도표기 달라도 동작) ──
function replaceDates(xml: string, shared: string[], date: string, maxRow: number): string {
  const t = ymd(date);
  // 대상: rows 1..maxRow 의 문자열 셀(t="s")
  return xml.replace(/<c r="([A-Z]+)(\d+)"([^>]*?)t="s"[^>]*>\s*<v>(\d+)<\/v>\s*<\/c>/g,
    (full, col, rowStr, attrs, idx) => {
      if (+rowStr > maxRow) return full;
      let s = shared[+idx]; if (s == null) return full;
      const before = s;
      s = s.replace(/\d{4}\s*년/g, `${t.yyyy}년`);
      if (s === before) s = s.replace(/(?<!\d)\d{2}\s*년/g, `${t.yy}년`);
      s = s.replace(/\d{1,2}\s*월\s*\d{1,2}\s*일/g, `${t.m}월 ${t.dd}일`);
      s = s.replace(/(?<!\d)\d{1,2}\s*월(?!\s*\d)/g, `${t.m}월`);
      s = s.replace(/(?<!\d)\d{1,2}\s*일/g, `${t.dd}일`);
      if (s === before) return full;
      const sMatch = attrs.match(/\ss="\d+"/);
      const sAttr = sMatch ? sMatch[0] : '';
      return `<c r="${col}${rowStr}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(s)}</t></is></c>`;
    });
}

function num(v: any) { return v !== '' && v !== null && v !== undefined && !isNaN(Number(v)) ? Number(v) : null; }

// ── 양식에 고정 인쇄된 안전관리자/점검자/서명 이름을 로그인 계정명으로 치환 ──
// sharedStrings.xml(<t> 내부) 및 시트 inline 문자열(<t> 내부) 모두에 적용.
// 부분 문자열도 치환하므로 별지14의 "(성 명) 황건우 (서명)" 같은 결합 셀도 처리된다.
function replaceNamesInXml(xml: string, names: string[], replacement: string): string {
  if (!replacement || !names || !names.length) return xml;
  return xml.replace(/(<t[^>]*>)([\s\S]*?)(<\/t>)/g, (full, open, inner, close) => {
    let s = inner;
    for (const nm of names) {
      if (!nm) continue;
      // XML 이스케이프된 형태/원문 모두 안전하게 단순 치환
      s = s.split(nm).join(xmlEsc(replacement));
    }
    return s === inner ? full : `${open}${s}${close}`;
  });
}

function fillByeolji1(xml: string, d: FillData): string {
  const t = ymd(d.date);
  xml = setCell(xml, 'B2', d.station_name, false);
  xml = setCell(xml, 'T3', d.inspector_name, false);
  xml = setCell(xml, 'B5', d.voltage, false);
  xml = setCell(xml, 'D5', d.capacity, false);
  xml = setCell(xml, 'B6', t.int, true);
  xml = setCell(xml, 'H6', d.inspection_type, false);
  xml = setCell(xml, 'J6', d.count || 1, true);
  (d.measure_sets || []).forEach((set, i) => {
    const p = PANEL[i]; if (!p) return;
    const map: [string, any][] = [
      [p.v.A, set.voltage_A], [p.v.B, set.voltage_B], [p.v.C, set.voltage_C], [p.v.N, set.voltage_N],
      [p.i.A, set.current_A], [p.i.B, set.current_B], [p.i.C, set.current_C],
    ];
    for (const [ref, val] of map) { const n = num(val); if (n !== null) xml = setCell(xml, ref, n, true); }
  });
  const rem = (d.measure_sets || []).map((s, i) => s.remarks ? `#${i + 1}: ${s.remarks}` : '').filter(Boolean).join(' / ')
    || d.remarks || '특이사항없음';
  xml = setCell(xml, 'A50', rem, false);
  return xml;
}

function fillByeolji14(xml: string, shared: string[], d: FillData): string {
  const t = ymd(d.date);
  xml = setCell(xml, 'G4', `${t.yy}년${t.mm}월${t.dd}일`, false);
  xml = setCell(xml, 'C7', d.station_name, false);
  const vNum = parseInt(d.voltage.replace(/[^0-9]/g, '') || '0', 10);
  const cNum = d.capacity.replace(/[^0-9]/g, '');
  xml = setCell(xml, 'C8', d.is_high_voltage ? `${vNum.toLocaleString()}[V] / ${cNum}[㎾]` : `${vNum}[V]/ ${cNum}[㎾]`, false);
  xml = setCell(xml, 'C38', d.remarks || '특이사항없음', false);
  return xml;
}

function fillByeolji7(xml: string, shared: string[], d: FillData): string {
  const t = ymd(d.date);
  xml = setCell(xml, 'AC3', `${t.yy}년`, false);
  xml = setCell(xml, 'AE3', +t.m, true);
  xml = setCell(xml, 'AI3', +t.d, true);
  xml = replaceDates(xml, shared, d.date, 5);
  return xml;
}

function fillByeolji2Ground(xml: string, shared: string[], d: FillData): string {
  xml = replaceDates(xml, shared, d.date, 8);
  // 접지저항 측정값: D5, D6, D7 ...
  (d.ground_resistance || []).forEach((v, i) => {
    const n = num(v);
    if (n !== null) xml = setCell(xml, `D${5 + i}`, n, true);
  });
  return xml;
}

function fillByeolji2(xml: string, shared: string[], d: FillData): string {
  return replaceDates(xml, shared, d.date, 8);
}

// ── 메인 ──
export async function buildInspectionXlsx(templateBuf: ArrayBuffer | Buffer, d: FillData): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuf);

  // workbook.xml: 시트명 → rId
  const wbx = await zip.file('xl/workbook.xml')!.async('string');
  const nameToRid = new Map<string, string>();
  for (const m of wbx.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) nameToRid.set(m[1], m[2]);
  // rels: rId → target
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const ridToTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)) ridToTarget.set(m[1], m[2]);

  const ssFile = zip.file('xl/sharedStrings.xml');
  const ssRaw = ssFile ? await ssFile.async('string') : '';
  const shared = ssRaw ? parseShared(ssRaw) : [];

  const names = d.replace_names || [];
  const repl = d.inspector_name || '';

  for (const [name, rid] of nameToRid) {
    const target = ridToTarget.get(rid); if (!target) continue;
    const path = 'xl/' + target.replace(/^\//, '').replace(/^xl\//, '');
    const f = zip.file(path); if (!f) continue;
    let xml = await f.async('string');

    const isB14 = name.includes('별지14');
    const isB1 = name.includes('별지1') && !isB14;
    const isB7 = name.includes('별지7');
    const isB2 = name.includes('별지2');
    const isGround = isB2 && name.includes('접지');

    if (isB1) xml = fillByeolji1(xml, d);
    else if (isB14) xml = fillByeolji14(xml, shared, d);
    else if (isB7) xml = fillByeolji7(xml, shared, d);
    else if (isGround) xml = fillByeolji2Ground(xml, shared, d);
    else if (isB2) xml = fillByeolji2(xml, shared, d);
    else {
      // 별지 매핑이 없는 시트도 이름 치환은 적용 (inline 문자열 한정)
      const nx = replaceNamesInXml(xml, names, repl);
      if (nx !== xml) zip.file(path, nx);
      continue;
    }

    // 채운 시트의 inline 문자열에 대해서도 이름 치환 적용
    xml = replaceNamesInXml(xml, names, repl);
    zip.file(path, xml);
  }

  // sharedStrings.xml 전체에 이름 치환 (V60 확인자 서명, 별지14 소속/성명 결합 셀 등 공유문자열 처리)
  if (ssRaw && repl && names.length) {
    const newSs = replaceNamesInXml(ssRaw, names, repl);
    if (newSs !== ssRaw) zip.file('xl/sharedStrings.xml', newSs);
  }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
