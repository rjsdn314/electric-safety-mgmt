// ============================================================
// lib/annual/drawingRead.ts
// 도면(PDF) → 변압기 용량·저압 간선 차단기 읽기 (무료: 브라우저 안에서 pdf.js 렌더 + tesseract.js OCR)
//  · 도면 PDF는 글자층이 없는 이미지라 OCR로 읽는다. 서버 업로드·AI 크레딧 없음.
//  · 고압: 단선결선도(보통 3쪽)의 "T.R : 3Ø 850kVA" + 저압반 간선표 "MCCB | 3 | 400 | 350"(극수|AF|AT)
//  · 저압: 수전 분전함 결선도 "PANEL BOARD : L-M(420kW)" → 용량으로 표준 구성 선택(ELB 칸은 OCR이 잘 못 읽음)
// ============================================================
import type { Breaker } from './spec';
import { breakerDefaults } from './spec';
import { typeForSize, LOW_TYPES } from './presets';

export interface DrawingRead {
  fileName: string;
  low: boolean;              // 저압 수전
  size: number;              // 고압 kVA / 저압 kW (0 = 못 읽음)
  feeders: Breaker[];        // 고압 간선표 차단기(위→아래 순서)
  spdPoles: 3 | 4;           // SPD용 MCCB 극수
  hasMccb350: boolean;       // 저압: MCCB 4P350 간선 존재(420kW B형 판별용)
  page: number;              // 읽은 쪽(1부터)
}

// OCR 글자 → 설비 정보 (순수 함수 — 테스트 가능)
export function parseDrawingText(text: string, fileName: string, prefix = '2'): Omit<DrawingRead, 'page'> {
  const fn = fileName.normalize('NFC');
  const low = /PANEL\s*BOARD\s*:?\s*L-?M/i.test(text) || /저압\s*\d{3}\s*kW/i.test(fn);
  let size = 0;
  if (low) {
    const m = text.match(/L-?M\s*\(\s*(\d{3})\s*kW/i) || fn.match(/저압\s*(\d{3})\s*kW/i) || text.match(/(\d{3})\s*kW/i);
    if (m) size = +m[1];
  } else {
    const m = text.match(/T\.?\s*R\s*:?[^\n]{0,8}?(\d{3,4})\s*kVA/i) || text.match(/\(\s*(\d{3,4})\s*kVA\s*\)/i) || fn.match(/(\d{3,4})\s*kVA/i);
    if (m) size = +m[1];
  }

  // 간선표 행: MCCB | 극수 | AF | AT  (OCR이 칸 구분선을 | [ ] ! 로 읽거나 붙여 읽음: "4400 | 350")
  const feeders: Breaker[] = [];
  let hasMccb350 = false;
  const rowRe = /\b(MCC[B8]|EL[B8])\w?\W{0,4}([234])\W{0,3}(\d{3,4}|\d{2,3})\W{1,4}(\d{2,4})\b/i;
  for (const line of text.split('\n')) {
    const r = line.match(rowRe);
    if (!r) continue;
    const kind = /EL/i.test(r[1]) ? 'ELB' : 'MCCB';
    const pole = +r[2], af = +r[3], at = +r[4];
    if (!(at >= 15 && at <= af && af <= 1600)) continue;   // 이상값 무시
    if (kind === 'MCCB' && pole === 4 && at === 350) hasMccb350 = true;
    const spec = `${prefix}${kind}${pole}P${at}A`;
    feeders.push({ spec, ...breakerDefaults(spec), remark: '' });
  }

  // SPD용 MCCB: "MCCB 3P" 다음 줄 근처의 "125AF/50AT"
  let spdPoles: 3 | 4 = 4;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  lines.forEach((l, i) => {
    const m = l.match(/MCC[B8]\s*([34])\s*P\b/i);
    const af = lines.slice(i + 1, i + 4).find((x) => /AF/i.test(x));   // 바로 아래 AF/AT 표기
    if (m && af && /50\s*AT/i.test(af) && !/200\s*AF/i.test(af)) spdPoles = +m[1] as 3 | 4;
  });

  return { fileName, low, size, feeders: low ? [] : feeders, spdPoles, hasMccb350 };
}

// 읽은 결과 → 표준 종류 + 간선 결정
//  · 도면 간선표를 다 읽었으면 그대로, 일부만 읽혔으면(표준 구성의 부분집합) 표준 구성으로 채우고 안내
export function reconcile(r: DrawingRead, prefix = '2'): { typeId: string; spdPoles: 3 | 4; size: number; feeders?: Breaker[]; note: string } {
  const label = r.fileName;
  if (!r.size) {
    return { typeId: r.low ? 'l210' : 'h850', spdPoles: r.spdPoles, size: 0, note: `${label}: 용량을 읽지 못해 기본 종류로 넣었습니다 — 종류를 직접 고르세요.` };
  }
  if (r.low) {
    let t = typeForSize(true, r.size);
    if (r.size === 420 && r.hasMccb350) t = LOW_TYPES.find((x) => x.id === 'l420b')!;
    return { typeId: t.id, spdPoles: 4, size: r.size, note: `${label}: 저압 ${r.size}kW → 「${t.label}」 표준 구성 (저압 분전함 ELB는 도면과 꼭 비교하세요)` };
  }
  const t = typeForSize(false, r.size);
  const std = [...t.feeders(prefix).map((b) => b.spec), ...(t.canopy ? [`${prefix}MCCB4P50A`] : [])];
  const got = r.feeders.map((b) => b.spec);
  const pool = [...std];
  const subset = got.every((s) => { const i = pool.indexOf(s); if (i < 0) return false; pool.splice(i, 1); return true; });
  const sizeNote = t.size !== r.size ? ` (표준 종류에 ${r.size}kVA가 없어 ${t.size}kVA 구성 기준)` : '';
  if (got.length >= std.length || !subset) {
    return { typeId: t.id, spdPoles: r.spdPoles, size: r.size, feeders: r.feeders,
      note: `${label}: TR ${r.size}kVA · 간선 ${got.length}개를 도면에서 읽음 · SPD ${r.spdPoles}P${sizeNote}` };
  }
  return { typeId: t.id, spdPoles: r.spdPoles, size: r.size,
    note: `${label}: TR ${r.size}kVA · 간선표 일부(${got.length}/${std.length}개)만 읽혀 표준 구성으로 채움 · SPD ${r.spdPoles}P — 도면과 비교하세요${sizeNote}` };
}

// ── 브라우저 전용: PDF 쪽 렌더 + OCR ──
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build';

async function loadPdfjs(): Promise<any> {
  const lib: any = await import(/* webpackIgnore: true */ `${PDFJS}/pdf.min.mjs`);
  lib.GlobalWorkerOptions.workerSrc = `${PDFJS}/pdf.worker.min.mjs`;
  return lib;
}

async function renderPage(pdf: any, n: number): Promise<HTMLCanvasElement> {
  const page = await pdf.getPage(n);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(4, 4800 / base.width);          // A3 도면 ≈ 4760px 폭
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp }).promise;
  return canvas;
}

const looksLikeOneLine = (t: string) => /T\.?\s*R\s*:?[^\n]{0,8}\d{3,4}\s*kVA|PANEL\s*BOARD\s*:?\s*L-?M/i.test(t);

export async function readDrawingPdf(file: File, prefix: string, onStep?: (s: string) => void): Promise<DrawingRead> {
  const pdfjs = await loadPdfjs();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  await worker.setParameters({ tessedit_pageseg_mode: '11' as any });
  try {
    // 단선결선도는 보통 3쪽 → 못 찾으면 앞쪽부터 차례로
    const order = [3, 4, 2, 5, 6, 1].filter((n) => n <= pdf.numPages);
    let best: { text: string; page: number } | null = null;
    for (const n of order) {
      onStep?.(`${file.name} — ${n}쪽 읽는 중…`);
      const canvas = await renderPage(pdf, n);
      const { data } = await worker.recognize(canvas);
      if (looksLikeOneLine(data.text)) { best = { text: data.text, page: n }; break; }
      if (!best) best = { text: data.text, page: n };
    }
    const parsed = parseDrawingText(best?.text || '', file.name, prefix);
    return { ...parsed, page: best?.page || 0 };
  } finally {
    await worker.terminate();
  }
}
