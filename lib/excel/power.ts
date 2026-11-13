// ============================================================
// lib/excel/power.ts
// 연차점검 전원품질측정기록표의 최대전력(E열)·역률(I열) 기입
//  · 변압기(수전 계통) 블록의 첫 행 = A열에 'TR…KVA' 또는 '저압 …KW' 라벨이 있는 행 (위에서부터 1번, 2번 …)
//  · 값은 한전ON/파워플래너에서 고객번호별로 확인한 최대수요전력(kW)과 지상역률(%)
// ============================================================
import JSZip from 'jszip';
import { setCell, parseShared } from './xmlFill';

export interface PowerValue { max_kw?: number | string | null; pf?: number | string | null }

function cellText(xml: string, ref: string, shared: string[]): string {
  const m = xml.match(new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`));
  if (!m) return '';
  const inner = m[2] || '';
  const v = inner.match(/<v>([\s\S]*?)<\/v>/);
  const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
  return ((/t="s"/.test(m[1]) && v) ? (shared[+v[1]] || '') : t ? t[1] : v ? v[1] : '').trim();
}

const num = (v: unknown) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : null;
};

// 전원품질 시트의 변압기 블록 라벨 목록 (화면 표시용)
export async function readPowerBlocks(buf: ArrayBuffer | Buffer): Promise<string[]> {
  const { blocks } = await locate(await JSZip.loadAsync(buf));
  return blocks.map((b) => b.label);
}

async function locate(zip: JSZip) {
  const wbx = await zip.file('xl/workbook.xml')!.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const ssRaw = (await zip.file('xl/sharedStrings.xml')?.async('string')) || '';
  const shared = ssRaw ? parseShared(ssRaw) : [];
  for (const m of wbx.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = (m[0].match(/name="([^"]+)"/) || [])[1] || '';
    const rid = (m[0].match(/r:id="([^"]+)"/) || [])[1];
    if (!name.includes('전원품질') || !rid) continue;
    const tm = rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`));
    if (!tm) continue;
    const path = 'xl/' + tm[1].replace(/^\//, '').replace(/^xl\//, '');
    const xml = await zip.file(path)!.async('string');
    const blocks: { row: number; label: string }[] = [];
    for (const c of xml.matchAll(/<c r="A(\d+)"/g)) {
      const r = +c[1];
      if (r < 6 || r > 17) continue;
      const s = cellText(xml, `A${r}`, shared);
      if (/KVA|KVＡ|TR|^저압|KW/i.test(s)) blocks.push({ row: r, label: s });
    }
    // 라벨 없는 양식(예: 농수산물): 6·9·12… 행 중 E/I 칸이 있는 행
    if (!blocks.length) for (let r = 6; r <= 15; r += 3) if (new RegExp(`<c r="L${r}"`).test(xml)) blocks.push({ row: r, label: `#${blocks.length + 1}` });
    blocks.sort((a, b) => a.row - b.row);
    return { path, xml, blocks };
  }
  return { path: '', xml: '', blocks: [] as { row: number; label: string }[] };
}

export async function applyPower(buf: ArrayBuffer | Buffer, values: PowerValue[]): Promise<{ buffer: Buffer; filled: number; blocks: string[] }> {
  const zip = await JSZip.loadAsync(buf);
  const { path, blocks, xml: xml0 } = await locate(zip);
  let xml = xml0;
  if (!path) throw new Error('이 점검표에는 전원품질측정기록표가 없습니다');
  let filled = 0;
  values.forEach((v, i) => {
    const b = blocks[i]; if (!b || !v) return;
    const kw = num(v.max_kw), pf = num(v.pf);
    if (kw !== null) { xml = setCell(xml, `E${b.row}`, kw, true); filled++; }
    if (pf !== null) xml = setCell(xml, `I${b.row}`, pf, true);
  });
  zip.file(path, xml);
  return { buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), filled, blocks: blocks.map((b) => b.label) };
}
