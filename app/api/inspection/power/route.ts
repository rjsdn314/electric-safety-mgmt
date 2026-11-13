// ============================================================
// app/api/inspection/power/route.ts
// 이미 만든 연차점검표의 전원품질 최대전력·역률 기입
//  · GET ?inspection_id=  → 변압기 블록 라벨과 저장된 값
//  · POST { inspection_id, values: [{ max_kw, pf, kepco_no?, month? }] }  (변압기 블록 순서)
//  · 엑셀(스토리지 같은 파일) 덮어쓰기 + measure_values.power 기록
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { applyPower, readPowerBlocks } from '@/lib/excel/power';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function load(inspection_id: string) {
  const cookieStore = await cookies();
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
  );
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 }) };
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: insp } = await sb.from('inspections').select('*').eq('id', inspection_id).single();
  if (!insp) return { error: NextResponse.json({ error: '점검 기록을 찾을 수 없습니다' }, { status: 404 }) };
  const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).single();
  if (prof?.role !== 'admin') {
    const { data: st } = await sb.from('stations').select('user_id').eq('id', insp.station_id).maybeSingle();
    if (st?.user_id && st.user_id !== user.id) return { error: NextResponse.json({ error: '본인 관리구역의 점검만 고칠 수 있습니다' }, { status: 403 }) };
  }
  const pathMatch = insp.file_path ? new URL(insp.file_path).pathname.match(/\/inspections\/(.+)$/) : null;
  if (!pathMatch) return { error: NextResponse.json({ error: '저장된 점검표 파일을 찾을 수 없습니다' }, { status: 404 }) };
  const storagePath = decodeURIComponent(pathMatch[1]);
  const { data: dl, error: dlErr } = await sb.storage.from('inspections').download(storagePath);
  if (dlErr || !dl) return { error: NextResponse.json({ error: `점검표 다운로드 실패: ${dlErr?.message || ''}` }, { status: 500 }) };
  return { sb, insp, storagePath, buf: await dl.arrayBuffer() };
}

export async function GET(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('inspection_id') || '';
    const a = await load(id);
    if ('error' in a) return a.error;
    return NextResponse.json({ success: true, blocks: await readPowerBlocks(a.buf), power: a.insp.measure_values?.power || null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { inspection_id, values } = await req.json();
    if (!inspection_id || !Array.isArray(values)) return NextResponse.json({ error: '입력값이 없습니다' }, { status: 400 });
    const a = await load(inspection_id);
    if ('error' in a) return a.error;
    const { sb, insp, storagePath, buf } = a;
    const { buffer, filled, blocks } = await applyPower(buf, values);
    const { error: upErr } = await sb.storage.from('inspections').upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: true,
    });
    if (upErr) throw new Error(`점검표 저장 실패: ${upErr.message}`);
    const downloadUrl = `${sb.storage.from('inspections').getPublicUrl(storagePath).data.publicUrl}?v=${Date.now()}`;
    const measure_values = { ...(insp.measure_values || {}), power: { values, blocks, updated_at: new Date().toISOString() } };
    const { error: dbErr } = await sb.from('inspections').update({ file_path: downloadUrl, measure_values }).eq('id', inspection_id);
    if (dbErr) throw new Error(`기록 저장 실패: ${dbErr.message}`);
    return NextResponse.json({ success: true, filled, blocks, downloadUrl, measure_values, fileName: insp.file_name, fileBase64: buffer.toString('base64') });
  } catch (e: any) {
    console.error('최대전력·역률 기입 오류:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
