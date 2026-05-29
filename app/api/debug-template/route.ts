import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

// 디버그용 — 가장 최근 점검 파일의 별지1 C열 판정 확인
export async function GET() {
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: insp } = await sb.from('inspections').select('file_path, file_name, inspection_date').order('created_at', { ascending: false }).limit(1).single();
    if (!insp) throw new Error('no inspection');
    const res = await fetch(insp.file_path);
    if (!res.ok) throw new Error('file fetch failed: ' + res.status);
    const buf = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('\uBCC4\uC9C01- \uC804\uAE30\uC124\uBE44\uC810\uAC80\uAE30\uB85D\uD45C') || wb.worksheets[0];
    const verdicts: any = {};
    for (let r = 13; r <= 46; r++) {
      const label = String(ws.getCell('A' + r).value ?? '');
      const sub = String(ws.getCell('B' + r).value ?? '');
      const mark = String(ws.getCell('C' + r).value ?? '');
      verdicts['C' + r] = { label, sub, mark };
    }
    return NextResponse.json({ file: insp.file_name, date: insp.inspection_date, verdicts });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
