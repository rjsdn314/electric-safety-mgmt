// ============================================================
// app/api/inspection/thermal/route.ts
// 이미 생성된 점검표에 별지7 열화상(온도·판정·대표사진)을 나중에 반영
//  · 요청: { inspection_id, b7_panels }  (b7_panels = 수배전반 순서별 부위 데이터)
//  · 스토리지의 같은 파일을 덮어쓰고, measure_values.thermal 기록 + 캐시 회피용 file_path 갱신
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { applyByeolji7 } from '@/lib/excel/xmlFill';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });

    const { inspection_id, b7_panels } = await req.json();
    if (!inspection_id) return NextResponse.json({ error: '점검 ID가 없습니다' }, { status: 400 });
    if (!Array.isArray(b7_panels) || !b7_panels.some(Boolean)) return NextResponse.json({ error: '반영할 열화상 사진이 없습니다' }, { status: 400 });

    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: insp, error: iErr } = await sb.from('inspections').select('*').eq('id', inspection_id).single();
    if (iErr || !insp) return NextResponse.json({ error: '점검 기록을 찾을 수 없습니다' }, { status: 404 });
    if (insp.inspection_type === '월차') return NextResponse.json({ error: '월차점검에는 별지7이 없습니다' }, { status: 400 });

    const pathMatch = insp.file_path ? new URL(insp.file_path).pathname.match(/\/inspections\/(.+)$/) : null;
    if (!pathMatch) return NextResponse.json({ error: '저장된 점검표 파일을 찾을 수 없습니다' }, { status: 404 });
    const storagePath = decodeURIComponent(pathMatch[1]);

    const { data: dl, error: dlErr } = await sb.storage.from('inspections').download(storagePath);
    if (dlErr || !dl) throw new Error(`점검표 다운로드 실패: ${dlErr?.message || ''}`);

    // 고압: 부위별 3행 / 저압: 온도 행 하나당 저압반 하나(한 시트에 여러 저압반 가능)
    const { data: st } = await sb.from('stations').select('voltage').eq('id', insp.station_id).maybeSingle();
    const mode: 'high' | 'low' = st?.voltage != null && Number(st.voltage) < 3000 ? 'low' : 'high';
    const { buffer, sheets, applied } = await applyByeolji7(await dl.arrayBuffer(), b7_panels, mode);
    if (b7_panels.filter(Boolean).length > sheets) {
      console.warn(`별지7 시트 ${sheets}개 < 사진 입력 수배전반 ${b7_panels.filter(Boolean).length}개`);
    }

    const { error: upErr } = await sb.storage.from('inspections').upload(storagePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    });
    if (upErr) throw new Error(`Storage 업로드 실패: ${upErr.message}`);

    const { data: urlData } = sb.storage.from('inspections').getPublicUrl(storagePath);
    const downloadUrl = `${urlData.publicUrl}?v=${Date.now()}`;   // 공개 URL 캐시로 이전 파일이 받아지는 것 방지
    const measure_values = {
      ...(insp.measure_values || {}),
      thermal: b7_panels.map((p: any) => p && Object.fromEntries(Object.entries(p).map(([k, v]: [string, any]) => [k, v?.temps || []]))),
      thermal_added_at: new Date().toISOString(),
    };
    const { error: dbErr } = await sb.from('inspections').update({ file_path: downloadUrl, measure_values }).eq('id', inspection_id);
    if (dbErr) throw new Error(`DB 저장 실패: ${dbErr.message}`);

    return NextResponse.json({
      success: true,
      applied, sheets,
      fileName: insp.file_name,
      downloadUrl,
      measure_values,
      fileBase64: buffer.toString('base64'),
    });
  } catch (e: any) {
    console.error('열화상 반영 오류:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
