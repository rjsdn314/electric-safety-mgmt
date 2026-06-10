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
  signature_b64?: string;       // 점검자 서명 이미지(data:image/png;base64,...) — 별지1·별지14 서명칸에 삽입
  weather?: string;             // 날씨/일기: 맑음·흐림·우천 — 별지14 D4 "(일기:OO)"
  remarks: string;
}

// 별지1 수배전반별 측정값 셀(병합셀 앵커). 개소마다 병합 행높이가 달라
// '개소#1 + 10행' 식의 균등 간격이 아니다. 각 셀은 R{n}:S{m}/T{n}:V{m} 병합의
// 좌상단(앵커)이어야 값이 보인다. 앵커가 아닌 칸(예: R24)에 쓰면 병합에 가려 누락된다.
// 모든 충전소 양식 + 공용 고압/저압 템플릿에서 동일 확인.
const PANEL = [
  { v: { A: 'R13', B: 'R14', C: 'R16', N: 'R19' }, i: { A: 'T13', B: 'T14', C: 'T16' } },
  { v: { A: 'R23', B: 'R26', C: 'R28', N: 'R30' }, i: { A: 'T23', B: 'T26', C: 'T28' } },
  { v: { A: 'R32', B: 'R33', C: 'R35', N: 'R37' }, i: { A: 'T32', B: 'T33', C: 'T35' } },
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

// 헤더의 '년'/'월'/'일' 라벨 옆 숫자 날짜셀 채우기.
//  · 정부 표준 별지는 [연(2칸)] 년 [월(2칸)] 월 [일(2칸)] 일 구조 → 라벨 2칸 왼쪽이 숫자값.
//  · 텍스트형 날짜는 replaceDates가, 숫자형(전원품질 AA3/AE3/AI3, 고압 AA5/AE5/AI5 등)은 이 함수가 처리.
//  → 전원품질·변압기·고압처럼 별도 채우기 함수가 없던 시트의 날짜가 양식 원본값으로 남던 문제 해결.
function fillHeaderDateNumbers(xml: string, shared: string[], date: string): string {
  const t = ymd(date);
  const labels: Array<[string, number]> = [['년', +t.yy], ['월', +t.m], ['일', +t.d]];
  const found = [...xml.matchAll(/<c r="([A-Z]+)(\d+)"[^>]*?t="s"[^>]*?><v>(\d+)<\/v>/g)];
  for (const m of found) {
    const col = m[1], row = +m[2];
    if (row > 10) continue;                       // 헤더 영역 한정
    const txt = (shared[+m[3]] || '').trim();
    const lab = labels.find(([l]) => txt === l);
    if (!lab) continue;
    const numColNum = colToNum(col) - 2;
    if (numColNum < 1) continue;
    xml = setCell(xml, `${numToCol(numColNum)}${row}`, lab[1], true);
  }
  return xml;
}

function num(v: any) { return v !== '' && v !== null && v !== undefined && !isNaN(Number(v)) ? Number(v) : null; }

// 컬럼 번호(1-base) → 문자 (8 → "H", 31 → "AE")
function numToCol(n: number): string { let s = ''; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

// 셀 내용만 비우고 스타일(s=)은 보존 (병합/테두리 유지). 없으면 그대로.
function clearCell(xml: string, ref: string): string {
  const cellRe = new RegExp(`<c r="${ref}"([^>]*?)(/>|>[\\s\\S]*?</c>)`);
  return xml.replace(cellRe, (_full, attrs) => {
    const s = (attrs.match(/\ss="\d+"/) || [''])[0];
    return `<c r="${ref}"${s}/>`;
  });
}

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
  xml = setCell(xml, 'D4', `(일기:${d.weather || '맑음'})`, false);   // 날씨/일기
  xml = setCell(xml, 'C7', d.station_name, false);
  const vNum = parseInt(d.voltage.replace(/[^0-9]/g, '') || '0', 10);
  const cNum = d.capacity.replace(/[^0-9]/g, '');
  xml = setCell(xml, 'C8', d.is_high_voltage ? `${vNum.toLocaleString()}[V] / ${cNum}[㎾]` : `${vNum}[V]/ ${cNum}[㎾]`, false);
  // 종합의견(C38): 직접 입력값 우선. 비어 있고 개소별 특이사항이 하나라도 있으면
  // '특이사항없음'을 적지 않고 공란으로 둔다. 모두 없을 때만 '특이사항없음'.
  const hasPanelRemark14 = (d.measure_sets || []).some((s) => s.remarks && String(s.remarks).trim());
  const overall14 = (d.remarks && d.remarks.trim()) ? d.remarks : (hasPanelRemark14 ? '' : '특이사항없음');
  xml = setCell(xml, 'C38', overall14, false);
  return xml;
}

function fillByeolji7(xml: string, shared: string[], d: FillData): string {
  const t = ymd(d.date);
  xml = setCell(xml, 'AC3', `${t.yy}년`, false);
  xml = setCell(xml, 'AE3', +t.m, true);
  xml = setCell(xml, 'AI3', +t.d, true);
  xml = replaceDates(xml, shared, d.date, 5);
  // 기본값 비우기: 측정치 행(H13:AE13, H15:AE15, H17:AE17)의 잔존 내용 제거.
  // 사용자가 직접 입력하기 전까지 공란으로 생성한다. (H=8 ~ AE=31)
  for (const row of [13, 15, 17]) {
    for (let c = 8; c <= 31; c++) xml = clearCell(xml, `${numToCol(c)}${row}`);
  }
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

// 전원품질측정기록표: 전압(L열)·전류(V열)를 별지1 측정값(measure_sets)으로 복사.
//  · A열에 'TR…KVA' 라벨이 있는 행이 각 변압기 블록의 시작(상 R/S/T = +0/+1/+2 행).
//  · 수배전반#k → k번째 TR 블록, 상 A/B/C 순서로 전압→L, 전류→V.
//  → "전원품질 전압/전류 = 별지1 값" 요구 반영(별지1에 입력하면 전원품질에 자동 반영).
function fillPowerQuality(xml: string, shared: string[], d: FillData): string {
  const trRows: number[] = [];
  for (const m of xml.matchAll(/<c r="A(\d+)"[^>]*?t="s"[^>]*?><v>(\d+)<\/v>/g)) {
    const txt = shared[+m[2]] || '';
    if (/KVA|KVＡ|TR/i.test(txt)) trRows.push(+m[1]);
  }
  trRows.sort((a, b) => a - b);
  (d.measure_sets || []).forEach((set, k) => {
    const base = trRows[k]; if (!base) return;
    const map: [string, any][] = [
      [`L${base}`, set.voltage_A], [`L${base + 1}`, set.voltage_B], [`L${base + 2}`, set.voltage_C],
      [`V${base}`, set.current_A], [`V${base + 1}`, set.current_B], [`V${base + 2}`, set.current_C],
    ];
    for (const [ref, v] of map) { const n = num(v); if (n !== null) xml = setCell(xml, ref, n, true); }
  });
  return xml;
}

// 인쇄/PDF 저장 시 잘림 방지: 시트를 "한 페이지에 맞춤"으로 설정.
//  · pageSetup fitToWidth="1" + fitToHeight="1" (가로·세로 모두 1페이지)
//  · sheetPr 안에 pageSetUpPr fitToPage="1" (맞춤 활성화) — 없으면 추가
// (인쇄영역을 실제 내용까지만 잡은 뒤 호출하므로 시트당 깔끔하게 한 장으로 나온다)
function fitSheetToWidth(xml: string): string {
  // pageSetup
  xml = xml.replace(/<(x:)?pageSetup\b([^>]*?)\s*\/>/, (_m, px = '', attrs) => {
    let a: string = attrs;
    a = /\bfitToWidth=/.test(a) ? a.replace(/fitToWidth="[^"]*"/, 'fitToWidth="1"') : a + ' fitToWidth="1"';
    a = /\bfitToHeight=/.test(a) ? a.replace(/fitToHeight="[^"]*"/, 'fitToHeight="1"') : a + ' fitToHeight="1"';
    return `<${px}pageSetup${a}/>`;
  });
  // pageSetUpPr fitToPage="1"
  if (/<(x:)?pageSetUpPr\b/.test(xml)) {
    xml = xml.replace(/<(x:)?pageSetUpPr\b([^>]*?)(\/?)>/, (_m, px = '', attrs, sl) =>
      `<${px}pageSetUpPr${/\bfitToPage=/.test(attrs) ? attrs.replace(/fitToPage="[^"]*"/, 'fitToPage="1"') : attrs + ' fitToPage="1"'}${sl}>`);
  } else if (/<(x:)?sheetPr\b[^>]*\/>/.test(xml)) {
    xml = xml.replace(/<(x:)?sheetPr\b([^>]*?)\s*\/>/, (_m, px = '', attrs) => `<${px}sheetPr${attrs}><${px}pageSetUpPr fitToPage="1"/></${px}sheetPr>`);
  } else if (/<(x:)?sheetPr\b[^>]*>/.test(xml)) {
    xml = xml.replace(/(<(x:)?sheetPr\b[^>]*>)/, (_m, open, px = '') => `${open}<${px}pageSetUpPr fitToPage="1"/>`);
  } else {
    xml = xml.replace(/(<(x:)?worksheet\b[^>]*>)/, (_m, open, px = '') => `${open}<${px}sheetPr><${px}pageSetUpPr fitToPage="1"/></${px}sheetPr>`);
  }
  return xml;
}

// 대형 블로트 시트 슬림화.
//  · 일부 양식(특히 별지2-절연)은 dimension A1:XFD265 에 빈 자기닫음 셀이 수백만 개 깔려
//    압축해제 시 수십 MB가 된다(예: 378만 셀, 75MB). 이를 그대로 처리하면 Vercel 함수가
//    폭주/타임아웃("An error..." 크래시)한다.
//  · 양식 본문은 100열 이내이므로, 값 없는 자기닫음 셀 중 열 100 초과를 제거하고 dimension을 줄인다.
//    (값 셀<v>/<is>/<f> 및 100열 이내 서식 셀은 모두 보존 → 양식 레이아웃 유지)
function deBloatSheet(xml: string): string {
  if (xml.length < 1_000_000) return xml;            // 정상 시트(<1MB)는 건드리지 않음
  xml = xml.replace(/<(?:x:)?c r="([A-Z]+)\d+"[^>]*?\/>/g, (m, col) => colToNum(col) > 100 ? '' : m);
  xml = xml.replace(/(<(?:x:)?dimension ref="[A-Z]+\d+:)[A-Z]+(\d+")/, '$1CV$2');
  return xml;
}

// 드로잉에서 임베드 이미지(<xdr:pic>)를 포함한 앵커를 제거 → 기본 사진 공란화.
// 도형(<xdr:sp>: 격자/타원 등)은 보존한다. (앵커는 중첩되지 않으므로 lazy 매칭 안전)
function removeDrawingPics(dx: string): string {
  // 사진(<xdr:pic ...>) 또는 이미지 채우기(<a:blip>)를 가진 앵커를 제거.
  // 주의: 양식에 따라 <xdr:pic> 에 속성이 붙어 있어(<xdr:pic macro="">) 정확 문자열 매칭은 누락된다.
  // 종별 타원 등 이미지 없는 도형 앵커는 보존된다.
  return dx.replace(/<xdr:(twoCellAnchor|oneCellAnchor|absoluteAnchor)\b[\s\S]*?<\/xdr:\1>/g,
    (block, _t) => (/<xdr:pic[\s>]/.test(block) || /<a:blip\b/.test(block)) ? '' : block);
}

// 점검종별 타원(prst="ellipse") 앵커의 from/to 열·열오프셋을 지정 좌표로 교체 → 타원을 가로 이동.
function moveTitleEllipse(dx: string, from: { col: number; colOff: number }, to: { col: number; colOff: number }): string {
  return dx.replace(/<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g, (block) => {
    if (!/prst="ellipse"/.test(block)) return block;
    let b = block.replace(/(<xdr:from>\s*<xdr:col>)\d+(<\/xdr:col>\s*<xdr:colOff>)\d+(<\/xdr:colOff>)/, `$1${from.col}$2${from.colOff}$3`);
    b = b.replace(/(<xdr:to>\s*<xdr:col>)\d+(<\/xdr:col>\s*<xdr:colOff>)\d+(<\/xdr:colOff>)/, `$1${to.col}$2${to.colOff}$3`);
    return b;
  });
}

// ── 메인 ──
export async function buildInspectionXlsx(templateBuf: ArrayBuffer | Buffer, d: FillData): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuf);

  // workbook.xml: 시트명 → rId
  const wbx = await zip.file('xl/workbook.xml')!.async('string');
  const nameToRid = new Map<string, string>();
  for (const m of wbx.matchAll(/<sheet[^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)) nameToRid.set(m[1], m[2]);
  // rels: rId → target (속성 순서 무관)
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const ridToTarget = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const tag = m[0];
    const id = (tag.match(/Id="([^"]+)"/) || [])[1];
    const tg = (tag.match(/Target="([^"]+)"/) || [])[1];
    if (id && tg) ridToTarget.set(id, tg);
  }

  const ssFile = zip.file('xl/sharedStrings.xml');
  const ssRaw = ssFile ? await ssFile.async('string') : '';
  const shared = ssRaw ? parseShared(ssRaw) : [];

  const names = d.replace_names || [];
  const repl = d.inspector_name || '';

  // 분기점검은 접지저항·절연저항 측정 제외 → 별지2 시트(접지저항+절연저항)를 출력에서 완전히 삭제.
  // (반기점검은 같은 양식을 폴백으로 쓰므로 별지2 시트를 모두 유지한다)
  const removeB2 = d.inspection_type === '분기';
  const toRemove: Array<{ rid: string; target: string }> = [];
  // 드로잉 후처리 대상: 별지7(사진 제거 + 반기 타원이동), 별지2-절연(반기 타원이동)
  const drawingTargets: Array<{ path: string; kind: 'b7' | 'b2' }> = [];

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

    if (isB7) drawingTargets.push({ path, kind: 'b7' });
    else if (isB2 && !removeB2 && name.includes('절연')) drawingTargets.push({ path, kind: 'b2' });

    if (isB2 && removeB2) {
      // 분기: 별지2(접지저항/절연저항) 모두 채우지 않고 삭제 대상으로 표시
      toRemove.push({ rid, target });
      continue;
    }

    // 대형 블로트 시트(별지2-절연 A1:XFD265 등, 수백만 빈셀·수십MB) 슬림화 → 처리 폭주/타임아웃 방지
    xml = deBloatSheet(xml);

    if (isB1) xml = fillByeolji1(xml, d);
    else if (isB14) xml = fillByeolji14(xml, shared, d);
    else if (isB7) xml = fillByeolji7(xml, shared, d);
    else if (isGround) xml = fillByeolji2Ground(xml, shared, d);
    else if (isB2) xml = fillByeolji2(xml, shared, d);
    else {
      // 별지 매핑이 없는 시트(전원품질·변압기·고압 등): 날짜를 점검일자로 동기화 + 이름 치환
      //  → 시트별 날짜 불일치(이 시트들만 양식 원본 날짜로 남던 문제) 해결
      xml = replaceDates(xml, shared, d.date, 10);            // 텍스트형 날짜
      xml = fillHeaderDateNumbers(xml, shared, d.date);       // 숫자형 날짜(년/월/일 라벨 옆)
      if (name.includes('전원품질')) xml = fillPowerQuality(xml, shared, d);  // 전압/전류 = 별지1 값
      xml = replaceNamesInXml(xml, names, repl);
      zip.file(path, xml);
      continue;
    }

    // 채운 시트의 inline 문자열에 대해서도 이름 치환 적용
    xml = replaceNamesInXml(xml, names, repl);
    zip.file(path, xml);
  }

  // 별지2 시트 실제 삭제 (workbook.xml / rels / 시트파일 / Content_Types / calcChain)
  if (removeB2 && toRemove.length) {
    const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let curWbx = wbx;
    let curRels = rels;
    let ct = (zip.file('[Content_Types].xml')) ? await zip.file('[Content_Types].xml')!.async('string') : '';

    for (const { rid, target } of toRemove) {
      curWbx = curWbx.replace(new RegExp(`<sheet\\b[^>]*r:id="${esc(rid)}"[^>]*/>`), '');
      curRels = curRels.replace(new RegExp(`<Relationship\\b[^>]*Id="${esc(rid)}"[^>]*/>`), '');
      const gp = 'xl/' + target.replace(/^\//, '').replace(/^xl\//, '');
      zip.remove(gp);
      if (ct) ct = ct.replace(new RegExp(`<Override\\b[^>]*PartName="/${esc(gp)}"[^>]*/>`), '');
    }

    // 시트 인덱스가 바뀌면 calcChain 참조가 깨질 수 있으므로 제거(엑셀이 자동 재생성)
    if (zip.file('xl/calcChain.xml')) {
      zip.remove('xl/calcChain.xml');
      if (ct) ct = ct.replace(/<Override\b[^>]*PartName="\/xl\/calcChain\.xml"[^>]*\/>/, '');
      curRels = curRels.replace(/<Relationship\b[^>]*Target="calcChain\.xml"[^>]*\/>/, '');
    }

    zip.file('xl/workbook.xml', curWbx);
    zip.file('xl/_rels/workbook.xml.rels', curRels);
    if (ct) zip.file('[Content_Types].xml', ct);
  }

  // ── 드로잉 후처리 ──
  //  · 별지7: 양식에 박혀 있던 기본 열화상 사진(임베드 이미지)을 제거 → 사진 미첨부 시 공란 생성
  //  · 반기: 점검종별 동그라미(타원 도형)가 양식상 '분기' 위에 그려져 있어, '반기' 위로 이동
  //    (분기·반기·연차 균등 간격, 별지7/별지2-절연 각각 측정한 좌표로 보정)
  const isHalf = d.inspection_type === '반기';
  for (const { path, kind } of drawingTargets) {
    const sx = await zip.file(path)?.async('string'); if (!sx) continue;
    const dm = sx.match(/<drawing r:id="([^"]+)"/); if (!dm) continue;
    const relsPath = path.replace(/(worksheets)\/(sheet\d+)\.xml$/, '$1/_rels/$2.xml.rels');
    const dr = await zip.file(relsPath)?.async('string'); if (!dr) continue;
    const tm = dr.match(new RegExp(`Id="${dm[1]}"[^>]*Target="([^"]+)"`)) || dr.match(new RegExp(`Target="([^"]+)"[^>]*Id="${dm[1]}"`));
    if (!tm) continue;
    const dp = 'xl/' + tm[1].replace(/^\.\.\//, '').replace(/^\//, '');
    const df = zip.file(dp); if (!df) continue;
    let dx = await df.async('string');
    const before = dx;
    if (kind === 'b7') dx = removeDrawingPics(dx);
    if (isHalf && kind === 'b7') dx = moveTitleEllipse(dx, { col: 27, colOff: 133350 }, { col: 31, colOff: 19050 });
    if (isHalf && kind === 'b2') dx = moveTitleEllipse(dx, { col: 6, colOff: 926306 }, { col: 7, colOff: 450056 });
    if (dx !== before) zip.file(dp, dx);
  }

  // ── 미디어 정리(GC) ──
  // 별지7 사진 앵커 제거 후, 어떤 드로잉에서도 더 이상 참조되지 않는 이미지 관계·파일을 삭제한다.
  // → 사진이 화면에서 사라질 뿐 아니라 파일 안에서도 완전히 제거되어 용량이 줄어든다.
  //   (다른 별지의 실제 사용 중인 이미지는 참조가 남아 있으므로 보존된다.)
  {
    const usedMedia = new Set<string>();
    const drawingRelsPaths = Object.keys(zip.files).filter((n) => /^xl\/drawings\/_rels\/drawing\d+\.xml\.rels$/.test(n));
    for (const relsP of drawingRelsPaths) {
      const drawXmlP = relsP.replace(/_rels\/(drawing\d+)\.xml\.rels$/, '$1.xml');
      const drawXml = await zip.file(drawXmlP)?.async('string');
      const relsXml = await zip.file(relsP)?.async('string');
      if (!relsXml) continue;
      const usedRids = new Set([...(drawXml || '').matchAll(/r:embed="([^"]+)"/g)].map((m) => m[1]));
      let newRels = relsXml;
      for (const rm of relsXml.matchAll(/<Relationship\b[^>]*\/>/g)) {
        const tag = rm[0];
        if (!/Type="[^"]*\/image"/.test(tag)) continue;
        const rid = (tag.match(/Id="([^"]+)"/) || [])[1];
        const tgt = (tag.match(/Target="([^"]+)"/) || [])[1];
        const mediaPath = 'xl/' + (tgt || '').replace(/^\.\.\//, '').replace(/^\//, '');
        if (rid && usedRids.has(rid)) usedMedia.add(mediaPath);
        else newRels = newRels.replace(tag, ''); // 미참조 이미지 관계 제거
      }
      if (newRels !== relsXml) zip.file(relsP, newRels);
    }
    for (const name of Object.keys(zip.files)) {
      if (/^xl\/media\//.test(name) && !usedMedia.has(name)) zip.remove(name);
    }
  }

  // ── 점검자 서명 삽입 ──
  // 별지1 우측하단 서명박스(하단부 행)·별지14 점검자칸(상단 행)에 들어가는 서명 이미지(미디어)를
  // 등록된 점검자 서명으로 교체한다. 앵커(셀 범위)는 그대로라 박스 크기에 맞게 들어간다.
  if (d.signature_b64) {
    const sigBytes = Buffer.from(d.signature_b64.replace(/^data:image\/[a-zA-Z+]+;base64,/, ''), 'base64');
    const sigMedia = new Set<string>();
    for (const [name, rid] of nameToRid) {
      const isB14 = name.includes('별지14');
      const isB1 = name.includes('별지1') && !isB14;
      if (!isB1 && !isB14) continue;
      const target = ridToTarget.get(rid); if (!target) continue;
      const sheetPath = 'xl/' + target.replace(/^\//, '').replace(/^xl\//, '');
      const sx = await zip.file(sheetPath)?.async('string'); if (!sx) continue;
      const dm = sx.match(/<drawing r:id="([^"]+)"/); if (!dm) continue;
      const relsPath = sheetPath.replace(/(worksheets)\/(sheet\d+)\.xml$/, '$1/_rels/$2.xml.rels');
      const dr = await zip.file(relsPath)?.async('string'); if (!dr) continue;
      const tm = dr.match(new RegExp(`Id="${dm[1]}"[^>]*Target="([^"]+)"`)); if (!tm) continue;
      const dp = 'xl/' + tm[1].replace(/^\.\.\//, '').replace(/^\//, '');
      const dx = await zip.file(dp)?.async('string'); if (!dx) continue;
      const drelsP = dp.replace(/drawings\/(drawing\d+)\.xml$/, 'drawings/_rels/$1.xml.rels');
      const drels = (await zip.file(drelsP)?.async('string')) || '';
      const rid2media: Record<string, string> = {};
      for (const rm of drels.matchAll(/Id="([^"]+)"[^>]*Target="([^"]+)"/g)) rid2media[rm[1]] = rm[2];
      for (const a of dx.matchAll(/<xdr:(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/xdr:\1>/g)) {
        const blk = a[0];
        const embed = (blk.match(/r:embed="([^"]+)"/) || [])[1]; if (!embed) continue;
        const fr = blk.match(/<xdr:from>\s*<xdr:col>\d+<\/xdr:col>\s*<xdr:colOff>\d+<\/xdr:colOff>\s*<xdr:row>(\d+)<\/xdr:row>/);
        if (!fr) continue;
        const frow = +fr[1];
        // 별지1: 하단 서명박스(행 50 이상), 별지14: 점검자칸(행 8 이하)
        if (isB1 ? frow >= 50 : frow <= 8) {
          const tgt = rid2media[embed];
          if (tgt) sigMedia.add('xl/' + tgt.replace(/^\.\.\//, '').replace(/^\//, ''));
        }
      }
    }
    for (const m of sigMedia) if (zip.file(m)) zip.file(m, sigBytes);
  }

  // sharedStrings.xml 전체에 이름 치환 (V60 확인자 서명, 별지14 소속/성명 결합 셀 등 공유문자열 처리)
  if (ssRaw && repl && names.length) {
    const newSs = replaceNamesInXml(ssRaw, names, repl);
    if (newSs !== ssRaw) zip.file('xl/sharedStrings.xml', newSs);
  }

  // 인쇄영역 + 페이지맞춤: 시트별로 "실제 내용까지만" 인쇄영역을 잡고 한 페이지에 맞춤.
  //  → 표 밖 먼 행의 사진/빈 행이 제외되어, 빈 페이지·떠다니는 사진 없이 시트당 한 장으로 출력.
  //  ⚠ 어떤 양식에서도 생성이 깨지지 않도록 전체를 try/catch로 보호한다.
  try {
    const wbXml = (await zip.file('xl/workbook.xml')?.async('string')) || '';
    const PFX = /<x:sheets[ >]/.test(wbXml) ? 'x:' : '';
    // 워크북의 시트 순서(이름·rId·0기반 index)
    const sheets = [...wbXml.matchAll(/<(?:x:)?sheet [^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/g)]
      .map((m, i) => ({ name: m[1], rid: m[2], idx: i }));
    const relsXml = (await zip.file('xl/_rels/workbook.xml.rels')?.async('string')) || '';
    const rid2file: Record<string, string> = {};
    for (const m of relsXml.matchAll(/Id="([^"]+)"[^>]*Target="([^"]*worksheets\/sheet\d+\.xml)"/g))
      rid2file[m[1]] = 'xl/' + m[2].replace(/^\.\//, '').replace(/^\//, '');

    const defs: string[] = [];
    for (const s of sheets) {
      const f = rid2file[s.rid];
      if (!f || !zip.file(f)) continue;
      const sx = await zip.file(f)!.async('string');
      // 값이 있는 셀(여는태그 직후 <v>/<is>/<f>)에서 마지막 행·열 산출.
      // ⚠ 빈 셀/빈 행을 [\s\S]*?로 스캔하면 자기닫음 셀이 많은 대형 양식에서 O(n²) 폭주
      //    → Vercel 함수 타임아웃("An error..." 크래시). 값셀을 직접 매칭해 선형으로 처리.
      let lastRow = 0, valCol = 0;
      for (const cm of sx.matchAll(/<(?:x:)?c r="([A-Z]+)(\d+)"[^>]*?>\s*<(?:x:)?(?:v|is|f)\b/g)) {
        valCol = Math.max(valCol, colToNum(cm[1]));
        lastRow = Math.max(lastRow, +cm[2]);
      }
      // 인쇄 폭: dimension의 최대 열(블로트면 값열로 대체)
      const dm = sx.match(/<(?:x:)?dimension ref="[A-Z]+\d+:([A-Z]+)\d+"/);
      let col = dm ? colToNum(dm[1]) : 0;
      if (col > 70 || col === 0) col = valCol;
      if (col === 0) col = valCol || 1;
      lastRow = lastRow || 1;
      const nm = s.name.replace(/'/g, "''");
      defs.push(`<${PFX}definedName name="_xlnm.Print_Area" localSheetId="${s.idx}">'${nm}'!$A$1:$${numToCol(col)}$${lastRow}</${PFX}definedName>`);
      // 페이지 맞춤(한 장)
      const nx = fitSheetToWidth(sx);
      if (nx !== sx) zip.file(f, nx);
    }

    // definedNames 삽입 — 스키마 순서(sheets→externalReferences→definedNames→calcPr) 준수.
    // 함수 치환으로 $ 백레퍼런스 오류 회피.
    if (defs.length && wbXml) {
      const block = `<${PFX}definedNames>${defs.join('')}</${PFX}definedNames>`;
      let nwb: string;
      if (/<(?:x:)?definedNames>/.test(wbXml)) {
        nwb = wbXml.replace(/<\/(?:x:)?definedNames>/, (m) => defs.join('') + m);
      } else if (/<(?:x:)?calcPr\b/.test(wbXml)) {
        nwb = wbXml.replace(/<(?:x:)?calcPr\b/, (m) => block + m);
      } else if (/<\/(?:x:)?externalReferences>/.test(wbXml)) {
        nwb = wbXml.replace(/<\/(?:x:)?externalReferences>/, (m) => m + block);
      } else {
        nwb = wbXml.replace(/<\/(?:x:)?sheets>/, (m) => m + block);
      }
      zip.file('xl/workbook.xml', nwb);
    }
  } catch { /* 인쇄영역/페이지맞춤 실패해도 생성은 정상 진행 */ }

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
