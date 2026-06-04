// ============================================================
// app/api/templates/upload/route.ts
// 관리자: 충전소별 점검표 양식(xlsx) 업로드
//  - 단일: station_id 지정
//  - 대량: 여러 파일 업로드 → 파일명으로 충전소 자동 매칭(미리보기 dryRun 지원)
// 업로드 시 네임스페이스 정규화 후 Storage('templates') 저장 + station_templates upsert
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { normalizeXlsx, detectSheetMeta } from '@/lib/excel/normalize';

export const runtime = 'nodejs';
export const maxDuration = 60;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// 충전소명 정규화: 공백/괄호/방향/말미 날짜숫자 제거 후 비교
function normName(s: string): string {
  return (s || '')
    .replace(/\.[^.]+$/, '')          // 확장자
    .replace(/\d{6,8}\s*$/g, '')      // 말미 날짜(250904 등)
    .replace(/\d{4}-\d{2}-\d{2}/g, '')
    .replace(/[()（）\s]/g, '')        // 괄호/공백
    .replace(/(분기|반기|월차|연차|고압|저압)/g, '')
    .replace(/방향$/, '')
    .toLowerCase();
}

function matchStation(fileName: string, stations: any[]): any | null {
  const fn = normName(fileName);
  let best: any = null, bestScore = 0;
  for (const st of stations) {
    for (const cand of [st.name, st.base_name]) {
      const c = normName(cand || '');
      if (!c) continue;
      let score = 0;
      if (fn === c) score = 100;
      else if (fn.includes(c) || c.includes(fn)) score = Math.min(fn.length, c.length);
      if (score > bestScore) { bestScore = score; best = st; }
    }
  }
  return bestScore >= 2 ? best : null;
}

export async function POST(req: NextRequest) {
  try {
    const sb = admin();
    const form = await req.formData();
    const files = form.getAll('files') as File[];
    const singleStationId = form.get('station_id') as string | null;
    const inspectionGroup = (form.get('inspection_group') as string) || '분기';
    const dryRun = form.get('dry_run') === 'true';
    const userId = form.get('user_id') as string | null;

    if (!files.length) throw new Error('업로드할 파일이 없습니다');

    const { data: stations } = await sb
      .from('stations').select('id, name, base_name').eq('is_active', true);

    const results: any[] = [];

    for (const file of files) {
      const matched = singleStationId
        ? (stations || []).find((s) => s.id === singleStationId)
        : matchStation(file.name, stations || []);

      const entry: any = {
        file_name: file.name,
        matched_station_id: matched?.id || null,
        matched_station_name: matched?.name || null,
        status: matched ? 'matched' : 'unmatched',
      };

      if (dryRun || !matched) { results.push(entry); continue; }

      const raw = Buffer.from(await file.arrayBuffer());
      const clean = await normalizeXlsx(raw);
      const meta = await detectSheetMeta(clean);

      const path = `${matched.id}/${inspectionGroup}.xlsx`;
      const { error: upErr } = await sb.storage
        .from('templates')
        .upload(path, clean, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true,
        });
      if (upErr) { entry.status = 'error'; entry.error = upErr.message; results.push(entry); continue; }

      const { data: urlData } = sb.storage.from('templates').getPublicUrl(path);

      const { error: dbErr } = await sb.from('station_templates').upsert({
        station_id: matched.id,
        inspection_group: inspectionGroup,
        file_path: path,
        public_url: urlData.publicUrl,
        original_name: file.name,
        sheet_names: meta.sheet_names,
        byeolji7_count: meta.byeolji7_count,
        has_insulation: meta.has_insulation,
        has_ground: meta.has_ground,
        uploaded_by: userId || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'station_id,inspection_group' });
      if (dbErr) { entry.status = 'error'; entry.error = dbErr.message; results.push(entry); continue; }

      entry.status = 'uploaded';
      entry.meta = meta;
      results.push(entry);
    }

    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      total: files.length,
      uploaded: results.filter((r) => r.status === 'uploaded').length,
      matched: results.filter((r) => r.status === 'matched').length,
      unmatched: results.filter((r) => r.status === 'unmatched').length,
      results,
    });
  } catch (e: any) {
    console.error('템플릿 업로드 오류:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
