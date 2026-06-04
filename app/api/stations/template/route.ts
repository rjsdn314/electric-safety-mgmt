// ============================================================
// GET /api/stations/template
// 관리구역 등록용 양식을 .xlsx로 생성해 다운로드시킨다.
// 컬럼(A~I): 담당자명 / 현장명 / 관리구역명 / 수전전압 / 계약용량 /
//            수배전반 개수 / 측정개소명(쉼표구분) / 기본점검양식 / 비고
// 1행 헤더, 2행 예시, 3행부터 실제 데이터 (업로드 라우트와 동일 기준)
// ============================================================
import { NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

export async function GET() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('관리구역');

  ws.addRow([
    '담당자명', '현장명', '관리구역명', '수전전압', '계약용량',
    '수배전반 개수', '측정개소명(쉼표구분)', '기본점검양식(월차/분기/반기/연차)', '비고',
  ]);
  ws.addRow([
    '홍길동', '횡성휴게소(강릉방향)', '강원권', 22900, 1849,
    2, '수배전반 #1,수배전반 #2', '월차', '(2행은 예시 — 3행부터 입력)',
  ]);

  // 서식: 헤더 강조 + 컬럼 폭
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
  ws.getRow(2).font = { italic: true, color: { argb: 'FF888888' } };
  const widths = [12, 26, 14, 10, 10, 14, 28, 30, 24];
  widths.forEach((w, i) => { ws.getColumn(i + 1).width = w; });

  const buf = await wb.xlsx.writeBuffer();
  // 한글 파일명 → RFC 5987 인코딩
  const fname = encodeURIComponent('관리구역_등록양식.xlsx');

  return new NextResponse(Buffer.from(buf), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="template.xlsx"; filename*=UTF-8''${fname}`,
      'Cache-Control': 'no-store',
    },
  });
}
