import { NextResponse } from 'next/server';

// 디버그용 라우트 — 사용 완료 후 비활성화함
export async function GET() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}
