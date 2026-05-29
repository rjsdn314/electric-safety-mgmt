import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export async function GET() {
  try {
    const url = `${process.env.NEXT_PUBLIC_APP_URL}/templates/template_\uC800\uC555.xlsx`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('template fetch failed: ' + res.status);
    const buf = await res.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const sheetNames = wb.worksheets.map(w => w.name);
    const ws = wb.getWorksheet('\uBCC4\uC9C01- \uC804\uAE30\uC124\uBE44\uC810\uAC80\uAE30\uB85D\uD45C') || wb.worksheets[0];
    const cells: any[] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        let v = cell.value;
        if (v && typeof v === 'object' && (v as any).richText) {
          v = (v as any).richText.map((r: any) => r.text).join('');
        }
        if (v !== null && v !== undefined && String(v).trim() !== '') {
          cells.push({ addr: cell.address, row: rowNumber, col: colNumber, val: String(v).replace(/\s+/g, '') });
        }
      });
    });
    return NextResponse.json({ sheetNames, sheet: ws.name, count: cells.length, cells });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
