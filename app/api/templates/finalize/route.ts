// ============================================================
// app/api/templates/finalize/route.ts
// 브라우저가 Storage에 직접 올린 양식을 서버에서 마무리:
//  Storage에서 내려받아 → 네임스페이스 정규화 → 같은 경로에 재업로드
//  → 시트 메타 감지 → station_templates 기록
// (대용량 파일 전송은 브라우저↔Storage 직접 처리하므로 Vercel 4.5MB 한도 무관)
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeXlsx, detectSheetMeta } from '@/lib/excel/normalize';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { station_id, original_name, inspection_group = '분기', user_id } = await req.json();
    if (!station_id) throw new Error('station_id 누락');

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const path = `${station_id}/quarterly.xlsx`;

    // 1) 방금 브라우저가 올린 원본 내려받기
    const { data: dl, error: dlErr } = await sb.storage.from('templates').download(path);
    if (dlErr || !dl) throw new Error(`업로드된 파일을 찾을 수 없습니다: ${dlErr?.message || ''}`);
    const raw = Buffer.from(await dl.arrayBuffer());

    // 2) 정규화 + 메타 감지
    const clean = await normalizeXlsx(raw);
    const meta = await detectSheetMeta(clean);

    // 3) 정규화본으로 덮어쓰기
    const { error: upErr } = await sb.storage.from('templates').upload(path, clean, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    });
    if (upErr) throw new Error(`정규화본 저장 실패: ${upErr.message}`);

    const { data: urlData } = sb.storage.from('templates').getPublicUrl(path);

    // 4) 메타 기록
    const { error: dbErr } = await sb.from('station_templates').upsert({
      station_id,
      inspection_group,
      file_path: path,
      public_url: urlData.publicUrl,
      original_name: original_name || null,
      sheet_names: meta.sheet_names,
      byeolji7_count: meta.byeolji7_count,
      has_insulation: meta.has_insulation,
      has_ground: meta.has_ground,
      uploaded_by: user_id || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'station_id,inspection_group' });
    if (dbErr) throw new Error(`DB 기록 실패: ${dbErr.message}`);

    return NextResponse.json({ success: true, meta });
  } catch (e: any) {
    console.error('finalize 오류:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
