// ============================================================
// lib/excel/certificate.ts
// 정기검사·사용전검사를 받은 개소: 점검표는 유효하게 두고, 열화상·접지 측정은 검사 필증으로 대체했다고 기입
//  · 별지7: '종합의견' 아래 칸에 대체 문구, 온도차 판정 칸은 '-'
//  · 별지2-접지저항: 측정치 = '필증 대체', 비고 = '<검사종류> 필증'
//  · 별지14: 종합의견(C38)에 대체 문구 (기존 의견이 있으면 뒤에 덧붙임)
// ============================================================
import JSZip from 'jszip';
import { setCell, parseShared } from './xmlFill';

export type CertKind = '정기검사' | '사용전검사';

export const certNote = (kind: CertKind, date: string) =>
  `${kind} 필증으로 대체 (검사일 ${date.replace(/-/g, '.')})`;

// 셀 글자 읽기 (공유 문자열·인라인 문자열·숫자)
function cellText(xml: string, ref: string, shared: string[]): string {
  const m = xml.match(new RegExp(`<c r="${ref}"([^>]*?)(?:/>|>([\\s\\S]*?)</c>)`));
  if (!m) return '';
  const inner = m[2] || '';
  const v = inner.match(/<v>([\s\S]*?)<\/v>/);
  const t = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
  return ((/t="s"/.test(m[1]) && v) ? (shared[+v[1]] || '') : t ? t[1] : v ? v[1] : '').trim();
}

function columnA(xml: string, shared: string[]): Map<number, string> {
  const out = new Map<number, string>();
  for (const m of xml.matchAll(/<c r="A(\d+)"/g)) {
    const s = cellText(xml, `A${m[1]}`, shared);
    if (s) out.set(+m[1], s);
  }
  return out;
}

export async function applyCertificate(buf: ArrayBuffer | Buffer, kind: CertKind, date: string): Promise<{ buffer: Buffer; touched: string[] }> {
  const zip = await JSZip.loadAsync(buf);
  const wbx = await zip.file('xl/workbook.xml')!.async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels')!.async('string');
  const ssRaw = (await zip.file('xl/sharedStrings.xml')?.async('string')) || '';
  const shared = ssRaw ? parseShared(ssRaw) : [];
  const note = certNote(kind, date);
  const touched: string[] = [];

  for (const m of wbx.matchAll(/<sheet\b[^>]*\/>/g)) {
    const name = (m[0].match(/name="([^"]+)"/) || [])[1] || '';
    const rid = (m[0].match(/r:id="([^"]+)"/) || [])[1];
    if (!rid) continue;
    const tm = rels.match(new RegExp(`Id="${rid}"[^>]*Target="([^"]+)"`)) || rels.match(new RegExp(`Target="([^"]+)"[^>]*Id="${rid}"`));
    if (!tm) continue;
    const path = 'xl/' + tm[1].replace(/^\//, '').replace(/^xl\//, '');
    const f = zip.file(path); if (!f) continue;
    let xml = await f.async('string');
    const before = xml;
    const compact = (s: string) => s.replace(/\s+/g, '');

    if (name.includes('별지7')) {
      const a = columnA(xml, shared);
      for (const [r, s] of a) if (compact(s) === '온도측정') xml = setCell(xml, `AF${r}`, '-', false);
      const opinion = [...a].filter(([, s]) => s.includes('종합의견')).map(([r]) => r).sort((x, y) => x - y)[0];
      if (opinion) xml = setCell(xml, `A${opinion + 1}`, note, false);
    } else if (name.includes('별지2') && name.includes('접지')) {
      for (let r = 5; r <= 22; r++) {
        if (!cellText(xml, `A${r}`, shared)) continue;
        xml = setCell(xml, `D${r}`, '필증 대체', false);
        xml = setCell(xml, `F${r}`, `${kind} 필증`, false);
      }
    } else if (name.includes('별지14')) {
      const cur = cellText(xml, 'C38', shared);
      const keep = cur && !/특이사항\s*없음/.test(cur) && !cur.includes('필증으로 대체') ? `${cur} / ` : '';
      xml = setCell(xml, 'C38', keep + note, false);
    }
    if (xml !== before) { zip.file(path, xml); touched.push(name); }
  }
  return { buffer: await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }), touched };
}
