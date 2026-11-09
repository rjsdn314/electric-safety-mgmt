// ============================================================
// app/api/inspection/certificate/route.ts
// 정기검사·사용전검사를 받은 개소: 열화상·접지 측정을 검사 필증으로 대체
//  · 요청(multipart): inspection_id, kind(정기검사|사용전검사), date(YYYY-MM-DD), file(필증 PDF/사진)
//  · 필증 파일 보관(inspections/certificates/<점검ID>/certificate.<확장자>)
//  · 점검표 엑셀에 대체 문구 기입(별지7 종합의견·별지2 접지·별지14 종합의견) 후 같은 파일 덮어쓰기
//  · measure_values.certificate 기록
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { applyCertificate, type CertKind } from '@/lib/excel/certificate';

export const runtime = 'nodejs';
export const maxDuration = 60;

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

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

    const form = await req.formData();
    const inspection_id = String(form.get('inspection_id') || '');
    const kind = String(form.get('kind') || '') as CertKind;
    const date = String(form.get('date') || '');
    const file = form.get('file') as File | null;
    if (!inspection_id) return NextResponse.json({ error: '점검 ID가 없습니다' }, { status: 400 });
    if (kind !== '정기검사' && kind !== '사용전검사') return NextResponse.json({ error: '검사 종류를 골라 주세요' }, { status: 400 });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: '검사일을 넣어 주세요' }, { status: 400 });
    if (!file || !file.size) return NextResponse.json({ error: '필증 파일을 골라 주세요' }, { status: 400 });

    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data: insp, error: iErr } = await sb.from('inspections').select('*').eq('id', inspection_id).single();
    if (iErr || !insp) return NextResponse.json({ error: '점검 기록을 찾을 수 없습니다' }, { status: 404 });

    // 권한: 관리자 또는 그 충전소 소유자
    const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).single();
    if (prof?.role !== 'admin') {
      const { data: st } = await sb.from('stations').select('user_id').eq('id', insp.station_id).maybeSingle();
      if (st?.user_id && st.user_id !== user.id) return NextResponse.json({ error: '본인 관리구역의 점검만 고칠 수 있습니다' }, { status: 403 });
    }

    // ① 필증 파일 보관 (스토리지 키는 ASCII만)
    const ext = (file.name.match(/\.([a-z0-9]{2,5})$/i)?.[1] || 'pdf').toLowerCase();
    const certPath = `certificates/${inspection_id}/certificate.${ext}`;
    const { error: cErr } = await sb.storage.from('inspections').upload(certPath, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type || (ext === 'pdf' ? 'application/pdf' : 'image/jpeg'), upsert: true,
    });
    if (cErr) throw new Error(`필증 저장 실패: ${cErr.message}`);
    const certUrl = `${sb.storage.from('inspections').getPublicUrl(certPath).data.publicUrl}?v=${Date.now()}`;

    // ② 점검표 엑셀에 대체 문구
    const pathMatch = insp.file_path ? new URL(insp.file_path).pathname.match(/\/inspections\/(.+)$/) : null;
    if (!pathMatch) return NextResponse.json({ error: '저장된 점검표 파일을 찾을 수 없습니다' }, { status: 404 });
    const storagePath = decodeURIComponent(pathMatch[1]);
    const { data: dl, error: dlErr } = await sb.storage.from('inspections').download(storagePath);
    if (dlErr || !dl) throw new Error(`점검표 다운로드 실패: ${dlErr?.message || ''}`);
    const { buffer, touched } = await applyCertificate(await dl.arrayBuffer(), kind, date);
    const { error: upErr } = await sb.storage.from('inspections').upload(storagePath, buffer, { contentType: XLSX, upsert: true });
    if (upErr) throw new Error(`점검표 저장 실패: ${upErr.message}`);
    const downloadUrl = `${sb.storage.from('inspections').getPublicUrl(storagePath).data.publicUrl}?v=${Date.now()}`;

    // ③ 기록
    const measure_values = {
      ...(insp.measure_values || {}),
      certificate: { kind, date, file_name: file.name, ext, url: certUrl, added_at: new Date().toISOString() },
    };
    const { error: dbErr } = await sb.from('inspections').update({ file_path: downloadUrl, measure_values }).eq('id', inspection_id);
    if (dbErr) throw new Error(`기록 저장 실패: ${dbErr.message}`);

    return NextResponse.json({ success: true, touched, downloadUrl, measure_values, fileName: insp.file_name, fileBase64: buffer.toString('base64') });
  } catch (e: any) {
    console.error('필증 대체 오류:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
