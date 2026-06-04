// ============================================================
// lib/excel/normalize.ts
// "Cell" 등 비-MS 앱으로 생성된 xlsx(x:/ep: 네임스페이스 프리픽스)는
// ExcelJS가 로드하지 못한다. 업로드 시 한 번 정규화하여 저장한다.
// 시트/스타일/이미지는 그대로 보존, XML 네임스페이스만 표준화.
// ============================================================
import JSZip from 'jszip';

const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

const STD_APP =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
  `<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">` +
  `<Application>Microsoft Excel</Application></Properties>`;

/**
 * xlsx 버퍼의 메인 네임스페이스 프리픽스를 표준형으로 정규화한다.
 * 이미 표준형이면 사실상 변화 없음(안전하게 멱등적).
 */
export async function normalizeXlsx(buf: ArrayBuffer | Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buf);
  const targets = Object.keys(zip.files).filter((n) =>
    /^xl\/(workbook\.xml|sharedStrings\.xml|styles\.xml|worksheets\/sheet\d+\.xml)$/.test(n)
  );
  for (const name of targets) {
    let xml = await zip.file(name)!.async('string');
    xml = xml
      .replace(/<x:/g, '<')
      .replace(/<\/x:/g, '</')
      .replace(new RegExp(`xmlns:x="${MAIN_NS}"`, 'g'), `xmlns="${MAIN_NS}"`);
    zip.file(name, xml);
  }
  if (zip.file('docProps/app.xml')) {
    zip.file('docProps/app.xml', STD_APP);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

/**
 * 업로드된 양식에서 시트 메타데이터를 자동 감지한다.
 */
export async function detectSheetMeta(buf: ArrayBuffer | Buffer) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as any);
  const names = wb.worksheets.map((w) => w.name);
  const b7 = names.filter((n) => n.includes('별지7'));
  const b2 = names.filter((n) => n.includes('별지2'));
  return {
    sheet_names: names,
    byeolji7_count: b7.length,
    byeolji7_names: b7,
    has_insulation: b2.some((n) => n.includes('절연')),
    has_ground: b2.some((n) => n.includes('접지')),
    has_byeolji1: names.some((n) => n.includes('별지1') && !n.includes('별지14')),
    has_byeolji14: names.some((n) => n.includes('별지14')),
  };
}
