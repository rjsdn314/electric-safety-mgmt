import { NextResponse } from 'next/server';

// 비활성화된 진단용 엔드포인트 (보안상 정보 노출 제거)
export async function GET() {
  return NextResponse.json({ error: 'not_found' }, { status: 404 });
}
