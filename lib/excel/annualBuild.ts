// ============================================================
// lib/excel/annualBuild.ts
// 도면 → 연차점검 양식 생성 엔진
//  · 입력: 고압 연차 기본틀(public/templates/annual_base_high.xlsx, 내린천휴게소 연차 양식 기반)
//          + 현장 설비 사양(AnnualSpec — AI가 도면에서 추출하고 사용자가 검토한 값)
//  · 출력: 그 현장 설비에 맞춘 "충전소별 연차 양식" — 이후 연차점검 생성 시 xmlFill이 날짜·측정값을 채운다.
//  · xmlFill과 같이 XML 값만 직접 교체 → 원본 서식·테두리·도형 보존.
//
// 현장마다 바뀌는 부분(양식의 빨간 글씨 + 기존 38개 연차 양식 비교로 찾은 부분):
//  별지1   B2 설비명 · B5/D5 수전전압/용량 · C/J열 설비 해당여부(○,/) · P13/P23/P32 측정개소(변압기 용량)
//  별지7   변압기마다 시트 1장(시트명 끝 = 용량) · T4 사용전압
//  별지2-절연저항  분전반별 차단기 목록(좌/우 2열, 넘치면 다음 페이지)
//  별지2-접지저항  분전반별 행
//  별지14  설치장소·수전전압/용량·충전기 용량/기수·제조사·모델
//  전원품질 변압기별 3행 블록(TR___KVA)
//  변압기점검 변압기별 2행
//  고압    기기절연 회로 목록 · 변압기별 접지저항 표(제목 끝 = 용량)
// ============================================================
import JSZip from 'jszip';
import {
  setCell, clearCell, parseShared, xmlEsc, colToNum, numToCol,
  removeDrawingPics, sheetDrawingPath, gcMedia,
} from './xmlFill';
import { AnnualSpec, LOW_ITEMS, HIGH_ITEMS, LIMITS, Panel } from '@/lib/annual/spec';

// ── 셀 쓰기 도우미 ──
function isNumStr(v: unknown): boolean {
  return typeof v === 'number' || (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()));
}
function put(xml: string, ref: string, v: unknown): string {
  if (v === null || v === undefined || String(v).trim() === '') return clearCell(xml, ref);
  return isNumStr(v) ? setCell(xml, ref, Number(v), true) : setCell(xml, ref, String(v), false);
}
function putFormula(xml: string, ref: string, f: string): string {
  xml = setCell(xml, ref, 0, true);   // 셀 확보(스타일 보존)
  return xml.replace(new RegExp(`<c r="${ref}"([^>]*?)>[\\s\\S]*?</c>`), `<c r="${ref}"$1><f>${xmlEsc(f)}</f></c>`);
}
function clearRange(xml: string, c1: string, c2: string, r1: number, r2: number): string {
  for (let r = r1; r <= r2; r++) for (let c = colToNum(c1); c <= colToNum(c2); c++) xml = clearCell(xml, `${numToCol(c)}${r}`);
  return xml;
}

// 셀 스타일만 지정(값 없음). 셀이 없으면 행에 열 순서로 삽입
function setStyle(xml: string, ref: string, s: string): string {
  const cellRe = new RegExp(`<c r="${ref}"([^>]*?)(/>|>)`);
  if (cellRe.test(xml)) {
    return xml.replace(cellRe, (_m, attrs: string, end: string) => {
      const a = /\ss="\d+"/.test(attrs) ? attrs.replace(/\ss="\d+"/, s ? ` s="${s}"` : '') : attrs + (s ? ` s="${s}"` : '');
      return `<c r="${ref}"${a}${end}`;
    });
  }
  xml = setCell(xml, ref, 0, true);   // 위치 확보 후 빈 셀로
  return xml.replace(new RegExp(`<c r="${ref}"[^>]*?>[\\s\\S]*?</c>`), `<c r="${ref}"${s ? ` s="${s}"` : ''}/>`);
}

function rowCells(xml: string, row: number): Array<{ col: string; s: string }> {
  const rm = xml.match(new RegExp(`<row r="${row}"[^>]*>([\\s\\S]*?)</row>`));
  if (!rm) return [];
  return [...rm[1].matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>)/g)].map((m) => ({ col: m[1], s: (m[2].match(/\ss="(\d+)"/) || [])[1] || '' }));
}

const parseRange = (ref: string) => {
  const m = ref.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  return m ? { c1: m[1], r1: +m[2], c2: m[3], r2: +m[4] } : null;
};

// 행 블록(src r1..r2)의 셀 스타일·행높이·병합을 dst 시작행으로 복제 → 양식에 없던 칸(3번째 변압기 등) 생성
function cloneRowBlock(xml: string, r1: number, r2: number, dst: number): string {
  const off = dst - r1;
  for (let r = r1; r <= r2; r++) {
    for (const { col, s } of rowCells(xml, r)) xml = setStyle(xml, `${col}${r + off}`, s);
    const src = xml.match(new RegExp(`<row r="${r}"([^>]*)>`));
    const ht = src?.[1].match(/\sht="[^"]*"/)?.[0];
    if (ht) {
      xml = xml.replace(new RegExp(`<row r="${r + off}"([^>]*)>`), (_m, a: string) => {
        let na = /\sht="/.test(a) ? a.replace(/\sht="[^"]*"/, ht) : a + ht;
        if (!/customHeight=/.test(na)) na += ' customHeight="1"';
        return `<row r="${r + off}"${na}>`;
      });
    }
  }
  // 병합: dst 구간과 겹치는 기존 병합 제거 → src 구간 병합을 이동 복제
  const dr1 = r1 + off, dr2 = r2 + off;
  const merges = [...xml.matchAll(/<mergeCell ref="([^"]+)"\/>/g)].map((m) => m[1]);
  const keep: string[] = [], add: string[] = [];
  for (const ref of merges) {
    const p = parseRange(ref);
    if (p && p.r1 <= dr2 && p.r2 >= dr1) continue;                // dst와 겹침 → 제거
    keep.push(ref);
    if (p && p.r1 >= r1 && p.r2 <= r2) add.push(`${p.c1}${p.r1 + off}:${p.c2}${p.r2 + off}`);
  }
  const all = [...keep, ...add];
  return xml.replace(/<mergeCells[^>]*>[\s\S]*?<\/mergeCells>/, `<mergeCells count="${all.length}">${all.map((r) => `<mergeCell ref="${r}"/>`).join('')}</mergeCells>`);
}

// ── 워크북 구조 도우미 ──
interface SheetRef { name: string; rid: string; path: string }
async function listSheets(zip: JSZip): Promise<SheetRef[]> {
  const wbx = await zip.file('xl/workbook.xml')!.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const rid2t = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*\/>/g)) {
    const id = (m[0].match(/Id="([^"]+)"/) || [])[1]; const t = (m[0].match(/Target="([^"]+)"/) || [])[1];
    if (id && t) rid2t.set(id, t);
  }
  return [...wbx.matchAll(/<sheet\b[^>]*\/>/g)].map((m) => {
    const name = (m[0].match(/name="([^"]+)"/) || [])[1];
    const rid = (m[0].match(/r:id="([^"]+)"/) || [])[1];
    const t = rid2t.get(rid) || '';
    return { name, rid, path: 'xl/' + t.replace(/^\//, '').replace(/^xl\//, '') };
  });
}

async function renameSheet(zip: JSZip, oldName: string, newName: string) {
  const p = 'xl/workbook.xml';
  const wbx = await zip.file(p)!.async('string');
  zip.file(p, wbx.replace(`name="${oldName}"`, `name="${xmlEsc(newName)}"`));
}

async function removeSheet(zip: JSZip, s: SheetRef) {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const drawing = await sheetDrawingPath(zip, s.path);
  let wbx = await zip.file('xl/workbook.xml')!.async('string');
  wbx = wbx.replace(new RegExp(`<sheet\\b[^>]*r:id="${esc(s.rid)}"[^>]*/>`), '');
  // activeTab이 범위를 벗어나지 않게
  wbx = wbx.replace(/\sactiveTab="\d+"/, ' activeTab="0"');
  zip.file('xl/workbook.xml', wbx);
  let rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  rels = rels.replace(new RegExp(`<Relationship\\b[^>]*Id="${esc(s.rid)}"[^>]*/>`), '');
  zip.file('xl/_rels/workbook.xml.rels', rels);
  let ct = await zip.file('[Content_Types].xml')!.async('string');
  ct = ct.replace(new RegExp(`<Override\\b[^>]*PartName="/${esc(s.path)}"[^>]*/>`), '');
  zip.remove(s.path);
  zip.remove(s.path.replace(/(worksheets)\/(sheet\d+)\.xml$/, '$1/_rels/$2.xml.rels'));
  if (drawing) {
    ct = ct.replace(new RegExp(`<Override\\b[^>]*PartName="/${esc(drawing)}"[^>]*/>`), '');
    zip.remove(drawing);
    zip.remove(drawing.replace(/drawings\/(drawing\d+)\.xml$/, 'drawings/_rels/$1.xml.rels'));
  }
  zip.file('[Content_Types].xml', ct);
}

// 시트 복제(별지7 3번째 변압기용). 드로잉은 사진을 뺀 사본(종별 타원 등 도형 유지)
async function cloneSheetAfter(zip: JSZip, src: SheetRef, newName: string) {
  const files = Object.keys(zip.files);
  const nextIdx = (re: RegExp) => Math.max(0, ...files.map((f) => +(f.match(re)?.[1] || 0))) + 1;
  const sIdx = nextIdx(/^xl\/worksheets\/sheet(\d+)\.xml$/);
  const newPath = `xl/worksheets/sheet${sIdx}.xml`;
  let sx = await zip.file(src.path)!.async('string');
  sx = sx.replace(/\stabSelected="1"/, '');
  zip.file(newPath, sx);
  let ct = await zip.file('[Content_Types].xml')!.async('string');
  ct = ct.replace('</Types>', `<Override PartName="/${newPath}" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`);

  const srcRelsPath = src.path.replace(/(worksheets)\/(sheet\d+)\.xml$/, '$1/_rels/$2.xml.rels');
  const srcRels = await zip.file(srcRelsPath)?.async('string');
  const srcDrawing = await sheetDrawingPath(zip, src.path);
  if (srcRels) {
    let nr = srcRels;
    if (srcDrawing) {
      const dIdx = nextIdx(/^xl\/drawings\/drawing(\d+)\.xml$/);
      const newDrawing = `xl/drawings/drawing${dIdx}.xml`;
      zip.file(newDrawing, removeDrawingPics(await zip.file(srcDrawing)!.async('string')));
      const sdr = srcDrawing.replace(/drawings\/(drawing\d+)\.xml$/, 'drawings/_rels/$1.xml.rels');
      const dr = await zip.file(sdr)?.async('string');
      if (dr) zip.file(`xl/drawings/_rels/drawing${dIdx}.xml.rels`, dr);   // 미사용 이미지 관계는 gcMedia가 정리
      nr = nr.replace(srcDrawing.replace(/^xl\/drawings\//, ''), `drawing${dIdx}.xml`);
      ct = ct.replace('</Types>', `<Override PartName="/${newDrawing}" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/></Types>`);
    }
    zip.file(`xl/worksheets/_rels/sheet${sIdx}.xml.rels`, nr);
  }
  zip.file('[Content_Types].xml', ct);

  let rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const ids = [...rels.matchAll(/Id="rId(\d+)"/g)].map((m) => +m[1]);
  const newRid = `rId${Math.max(0, ...ids) + 1}`;
  const srcTag = rels.match(new RegExp(`<Relationship\\b[^>]*Id="${src.rid}"[^>]*/>`))![0];
  const srcTarget = (srcTag.match(/Target="([^"]+)"/) || [])[1];
  const newTarget = srcTarget.replace(/sheet\d+\.xml$/, `sheet${sIdx}.xml`);
  rels = rels.replace('</Relationships>', `<Relationship Id="${newRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="${newTarget}"/></Relationships>`);
  zip.file('xl/_rels/workbook.xml.rels', rels);

  let wbx = await zip.file('xl/workbook.xml')!.async('string');
  const sheetIds = [...wbx.matchAll(/sheetId="(\d+)"/g)].map((m) => +m[1]);
  const srcSheetTag = wbx.match(new RegExp(`<sheet\\b[^>]*r:id="${src.rid}"[^>]*/>`))![0];
  wbx = wbx.replace(srcSheetTag, `${srcSheetTag}<sheet name="${xmlEsc(newName)}" sheetId="${Math.max(0, ...sheetIds) + 1}" r:id="${newRid}"/>`);
  zip.file('xl/workbook.xml', wbx);
}

// ── 시트별 채우기 ──
const PANEL_LABEL_ROWS = [13, 23, 32];
const PANEL_MEAS = ['R13', 'R14', 'R16', 'R19', 'T13', 'T14', 'T16', 'R23', 'R26', 'R28', 'R30', 'T23', 'T26', 'T28', 'R32', 'R33', 'R35', 'R37', 'T32', 'T33', 'T35'];

function fillB1(xml: string, sp: AnnualSpec): string {
  xml = put(xml, 'B2', sp.station_label);
  xml = put(xml, 'B5', `${sp.supply_voltage}V`);
  xml = put(xml, 'D5', `${sp.capacity_kw}KW`);
  for (const it of LOW_ITEMS) xml = put(xml, `C${it.row}`, sp.marks_low[it.key] || '/');
  for (const it of HIGH_ITEMS) xml = put(xml, `J${it.row}`, sp.marks_high[it.key] || '/');
  PANEL_LABEL_ROWS.forEach((r, k) => {
    const tr = sp.transformers[k];
    xml = put(xml, `P${r}`, tr ? `측정개소 ${tr.kva}` : '측정개소');
  });
  for (const ref of PANEL_MEAS) xml = clearCell(xml, ref);   // 측정값은 점검 생성 때 입력
  xml = clearCell(xml, 'A50');                                // 종합의견(현장 특이사항) 초기화
  return xml;
}

function fillB7(xml: string, sp: AnnualSpec): string {
  xml = put(xml, 'T4', `${sp.supply_voltage}V`);
  for (const c of ['H', 'P', 'X']) for (const r of [13, 15, 17]) xml = clearCell(xml, `${c}${r}`);
  return xml;
}

// 별지2-절연저항: 페이지 1 = 데이터 8~32행, 페이지 k(≥2) = 43+33(k-2) ~ 66+33(k-2)행. 각 페이지 좌(A~F)/우(G~L) 2열
function insulPages(): Array<{ r1: number; r2: number; hdrOff: number }> {
  const pages = [{ r1: 8, r2: 32, hdrOff: 0 }];
  for (let k = 2; k <= LIMITS.insulPages; k++) pages.push({ r1: 43 + 33 * (k - 2), r2: 66 + 33 * (k - 2), hdrOff: 35 + 33 * (k - 2) });
  return pages;
}

function fillInsulation(xml: string, shared: string[], panels: Panel[], warnings: string[]): string {
  const pages = insulPages();
  for (const p of pages) xml = clearRange(xml, 'A', 'L', p.r1, p.r2);
  // 데이터 칸 서식 통일: 원본 양식은 행마다 글꼴 크기가 섞여 있고(빨간 글씨 칸) 2페이지 이후엔 테두리가 없다
  //  → 1페이지 9행(차단기 행) 서식을 모든 페이지 데이터 행에 적용
  const proto = rowCells(xml, 9).filter((c) => colToNum(c.col) <= 12);
  if (proto.length) {
    for (const p of pages) for (let r = p.r1; r <= p.r2; r++) for (const c of proto) xml = setStyle(xml, `${c.col}${r}`, c.s);
  }
  const slots = pages.flatMap((p, pi) => [
    { page: pi, cols: ['A', 'B', 'C', 'D', 'E', 'F'], r1: p.r1, r2: p.r2 },
    { page: pi, cols: ['G', 'H', 'I', 'J', 'K', 'L'], r1: p.r1, r2: p.r2 },
  ]);
  let si = 0, row = slots[0].r1, usedPages = 1;
  const writeRow = (vals: unknown[]) => {
    const s = slots[si];
    s.cols.forEach((c, i) => { xml = put(xml, `${c}${row}`, vals[i]); });
    usedPages = Math.max(usedPages, s.page + 1);
    row++;
  };
  for (const pn of panels) {
    const lines: unknown[][] = [[pn.name], ...pn.breakers.map((b) => [b.spec, b.voltage, 0.2, b.value, '적합', b.remark])];
    let first = true;
    while (lines.length) {
      if (si >= slots.length) { warnings.push('절연저항 표가 8페이지를 넘어 일부 차단기가 빠졌습니다'); return xml; }
      const s = slots[si];
      const left = s.r2 - row + 1;
      // 블록이 남은 칸에 안 들어가면 다음 칸으로(빈 칸이 아닐 때만). 칸 하나보다 크면 나눠 쓴다.
      if (first && lines.length > left && row > s.r1) { si++; if (si < slots.length) row = slots[si].r1; continue; }
      if (left <= 0) { si++; if (si < slots.length) row = slots[si].r1; lines.unshift([`${pn.name}(계속)`]); continue; }
      writeRow(lines.shift()!);
      first = false;
    }
  }
  // 2페이지 이상 쓰면 제목·머리글(1페이지 2~7행, 날짜행 4 제외)을 복사
  if (usedPages > 1) {
    const hdrRefs = [...xml.matchAll(/<c r="([A-Z]+)([2-7])"[^>]*?t="s"[^>]*?><v>(\d+)<\/v>/g)];
    for (let k = 1; k < usedPages; k++) {
      for (const m of hdrRefs) {
        if (m[2] === '4') continue;
        xml = put(xml, `${m[1]}${+m[2] + pages[k].hdrOff}`, shared[+m[3]] || '');
      }
    }
  }
  return xml;
}

function fillGround(xml: string, panels: Panel[], warnings: string[]): string {
  xml = clearRange(xml, 'A', 'L', 5, 22);
  const gp = panels.filter((p) => p.ground);
  if (gp.length > 18) warnings.push('접지저항 표는 18개 분전반까지만 들어갑니다');
  gp.slice(0, 18).forEach((p, i) => {
    const r = 5 + i;
    xml = put(xml, `A${r}`, `<${p.name} >`);
    xml = put(xml, `B${r}`, p.voltage || '380/220');
    xml = put(xml, `C${r}`, '100 이하');
    xml = put(xml, `E${r}`, '적 합');
    xml = put(xml, `F${r}`, ' 부하측 ');
  });
  return xml;
}

function fillB14(xml: string, sp: AnnualSpec): string {
  xml = put(xml, 'C7', sp.station_label);
  xml = put(xml, 'C8', `${sp.supply_voltage.toLocaleString('en-US')}[V] / ${sp.capacity_kw}[㎾]`);
  for (const c of ['D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']) { xml = clearCell(xml, `${c}8`); xml = clearCell(xml, `${c}9`); }
  const groups = sp.chargers.filter((c) => c.kw > 0 && c.count > 0);
  xml = put(xml, 'C9', groups.map((g) => `( ${g.kw} ) kW ( ${g.count} )기`).join('/'));
  const loc = sp.charger_location;
  xml = put(xml, 'C10', `${loc === '옥내' ? '■' : '□'}옥내${loc === '옥외' ? '■' : '□'}옥외${loc === '기타' ? '■' : '□'}기타( )`);
  const t = sp.charger_types;
  xml = put(xml, 'C11', `${t.chademo ? '■' : '□'}DC차데모${t.combo ? '■' : '□'}DC콤보${t.ac3 ? '■' : '□'}AC3상`);
  const total = groups.reduce((s, g) => s + g.kw * g.count, 0);
  xml = put(xml, 'E12', total ? `380[V] / ${total}[㎾]` : '');
  xml = put(xml, 'E13', sp.charger_maker);
  const models = groups.filter((g) => g.model).map((g) => `${g.kw}kW : ${g.model}`);
  xml = put(xml, 'H13', models[0] || '');
  xml = put(xml, 'H14', models.slice(1).join(', '));
  return xml;
}

const PQ_BLOCKS = [6, 9, 12];
function fillPowerQualityBase(xml: string, sp: AnnualSpec): string {
  PQ_BLOCKS.forEach((r, k) => {
    const tr = sp.transformers[k];
    if (tr && k === 2) xml = cloneRowBlock(xml, 9, 11, 12);
    xml = clearRange(xml, 'A', 'AL', r, r + 2);
    if (!tr) return;
    xml = put(xml, `A${r}`, `TR${tr.kva}KVA`);
    xml = put(xml, `E${r}`, tr.max_kw);
    xml = put(xml, `I${r}`, tr.pf);
    xml = putFormula(xml, `AA${r}`, `(MAX(V${r},V${r + 1},V${r + 2})-MIN(V${r},V${r + 1},V${r + 2}))/((V${r}+V${r + 1}+V${r + 2})/3)`);
    xml = putFormula(xml, `AA${r + 1}`, `+AA${r}`);
    xml = putFormula(xml, `AA${r + 2}`, `+AA${r}`);
    xml = put(xml, `AK${r}`, '적합');
  });
  return xml;
}

const TR_ROWS = [8, 10, 12];
function fillTransformers(xml: string, sp: AnnualSpec): string {
  TR_ROWS.forEach((r, k) => {
    const tr = sp.transformers[k];
    if (tr && k === 2) xml = cloneRowBlock(xml, 10, 11, 12);
    xml = clearRange(xml, 'A', 'N', r, r + 1);
    if (!tr) return;
    xml = put(xml, `A${r}`, tr.phase || '3￠');
    xml = put(xml, `A${r + 1}`, `${tr.kva}KVA`);
    xml = put(xml, `B${r}`, tr.volt);
    xml = put(xml, `C${r}`, tr.maker);
    xml = put(xml, `D${r}`, tr.serial);
    xml = put(xml, `E${r}`, 'O');
    for (const c of ['F', 'G', 'H']) xml = put(xml, `${c}${r}`, 2000);
    xml = put(xml, `K${r}`, tr.oil);
    xml = put(xml, `M${r}`, '적 합');
    xml = put(xml, `N${r}`, tr.location);
  });
  return xml;
}

const HV_SIDES = [
  { title: 'A20', wire: 'I', std: 'O', val: 'U', clear: ['A', 'AL'] as const },
  { title: 'AN20', wire: 'AV', std: 'BB', val: 'BH', clear: ['AN', 'BY'] as const },
];
function fillHighVoltage(xml: string, sp: AnnualSpec, warnings: string[]): string {
  xml = clearRange(xml, 'A', 'AL', 8, 18);
  sp.hv_circuits.slice(0, LIMITS.hvCircuits).forEach((c, i) => {
    const r = 8 + i;
    xml = put(xml, `A${r}`, c.name); xml = put(xml, `I${r}`, c.insul);
    xml = put(xml, `P${r}`, c.ab); xml = put(xml, `S${r}`, c.bc); xml = put(xml, `V${r}`, c.ca);
    xml = put(xml, `Y${r}`, c.result); xml = put(xml, `AG${r}`, c.remark);
  });
  if (sp.hv_circuits.length > LIMITS.hvCircuits) warnings.push(`고압 기기절연 표는 ${LIMITS.hvCircuits}행까지만 들어갑니다`);
  HV_SIDES.forEach((side, k) => {
    const tr = sp.transformers[k];
    if (!tr) {
      if (k > 0) xml = clearRange(xml, side.clear[0], side.clear[1], 20, 30);   // 변압기 1대: 오른쪽 표 비움
      return;
    }
    xml = put(xml, side.title, `ㅁ접지저항 측정기록표${tr.kva}`);
    tr.ground.slice(0, 8).forEach((g, i) => {
      const r = 23 + i;
      xml = put(xml, `${side.wire}${r}`, g.wire);
      xml = put(xml, `${side.std}${r}`, g.standard);
      xml = put(xml, `${side.val}${r}`, g.value);
    });
  });
  if (sp.transformers.length > 2) warnings.push('고압 접지저항 표는 변압기 2대분만 있습니다 — 3번째 변압기 접지 표는 엑셀에서 직접 추가하세요');
  return xml;
}

// ── 메인 ──
export async function buildAnnualXlsx(baseBuf: ArrayBuffer | Buffer, spec: AnnualSpec): Promise<{ buffer: Buffer; warnings: string[] }> {
  const warnings: string[] = [];
  const sp: AnnualSpec = { ...spec, transformers: spec.transformers.slice(0, LIMITS.transformers) };
  if (spec.transformers.length > LIMITS.transformers) warnings.push(`변압기는 ${LIMITS.transformers}대까지만 양식에 들어갑니다`);
  if (!sp.transformers.length) warnings.push('변압기가 없어 별지7·전원품질·변압기점검이 비어 있습니다');

  const zip = await JSZip.loadAsync(baseBuf);
  const ssRaw = (await zip.file('xl/sharedStrings.xml')?.async('string')) || '';
  const shared = ssRaw ? parseShared(ssRaw) : [];

  // 1) 별지7 시트 수 = 변압기 수 (최소 1장 유지)
  let sheets = await listSheets(zip);
  const b7 = sheets.filter((s) => s.name.includes('별지7'));
  const want = Math.max(1, sp.transformers.length);
  for (let i = b7.length; i < want; i++) await cloneSheetAfter(zip, b7[b7.length - 1], `__b7_${i}`);
  for (let i = want; i < b7.length; i++) await removeSheet(zip, b7[i]);
  sheets = await listSheets(zip);
  const b7now = sheets.filter((s) => s.name.includes('별지7') || s.name.startsWith('__b7_'));
  const usedNames = new Set<string>();
  for (let i = 0; i < b7now.length; i++) {
    const kva = sp.transformers[i]?.kva;
    let nm = kva ? `별지7-적외선열화상분포측정기록표 ${kva}` : '별지7-적외선열화상분포측정기록표';
    let n = 2; const base = nm;
    while (usedNames.has(nm)) nm = `${base}-${n++}`;
    usedNames.add(nm);
    if (nm !== b7now[i].name) await renameSheet(zip, b7now[i].name, nm);
  }

  // 2) 시트별 값 채우기
  sheets = await listSheets(zip);
  for (const s of sheets) {
    const f = zip.file(s.path); if (!f) continue;
    let xml = await f.async('string');
    const n = s.name;
    if (n.includes('별지14')) xml = fillB14(xml, sp);
    else if (n.includes('별지1')) xml = fillB1(xml, sp);
    else if (n.includes('별지7')) xml = fillB7(xml, sp);
    else if (n.includes('절연')) xml = fillInsulation(xml, shared, sp.panels, warnings);
    else if (n.includes('접지')) xml = fillGround(xml, sp.panels, warnings);
    else if (n.includes('전원품질')) xml = fillPowerQualityBase(xml, sp);
    else if (n.includes('변압기')) xml = fillTransformers(xml, sp);
    else if (n.includes('고압')) xml = fillHighVoltage(xml, sp, warnings);
    zip.file(s.path, xml);
  }

  // 3) 별지7 기본 열화상 사진 제거 + 미사용 이미지 정리
  for (const s of sheets.filter((x) => x.name.includes('별지7'))) {
    const dp = await sheetDrawingPath(zip, s.path);
    if (!dp) continue;
    const dx = await zip.file(dp)!.async('string');
    const nx = removeDrawingPics(dx);
    if (nx !== dx) zip.file(dp, nx);
  }
  await gcMedia(zip);

  // 계산 체인은 시트 구조가 바뀌면 깨질 수 있으므로 제거(엑셀이 재생성)
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    const ct = await zip.file('[Content_Types].xml')!.async('string');
    zip.file('[Content_Types].xml', ct.replace(/<Override\b[^>]*calcChain[^>]*\/>/, ''));
    const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
    zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship\b[^>]*calcChain[^>]*\/>/, ''));
  }
  // 엑셀이 열 때 수식(전원품질 불평형률) 다시 계산
  const wbx = await zip.file('xl/workbook.xml')!.async('string');
  if (!/fullCalcOnLoad/.test(wbx)) {
    zip.file('xl/workbook.xml', /<calcPr\b/.test(wbx)
      ? wbx.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"')
      : wbx.replace('</workbook>', '<calcPr fullCalcOnLoad="1"/></workbook>'));
  }

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return { buffer, warnings };
}
