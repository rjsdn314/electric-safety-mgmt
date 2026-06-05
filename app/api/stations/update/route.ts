import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// POST /api/stations/update
// Cookie 인증. 본인이 등록한 관리구역(충전소)만 수정 가능 (admin은 전체).
// 수정 항목: 현장명/관리구역명/수전전압/계약용량/점검개소수/점검개소명/비고
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const authClient = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } },
    );
    const { data: { user } } = await authClient.auth.getUser();
    if (!user) return NextResponse.json({ error: '인증 실패 (로그인이 필요합니다)' }, { status: 401 });

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { data: profile } = await supabase
      .from('profiles').select('id, role').eq('id', user.id).single();

    const body = await req.json();
    const id = String(body.id || '').trim();
    if (!id) return NextResponse.json({ error: 'id가 필요합니다' }, { status: 400 });

    const { data: target } = await supabase
      .from('stations').select('*').eq('id', id).single();
    if (!target) return NextResponse.json({ error: '대상을 찾을 수 없습니다' }, { status: 404 });

    // 소유권 확인: 본인이 등록한 현장만 (admin 예외)
    const isAdmin = profile?.role === 'admin';
    if (!isAdmin && target.user_id && target.user_id !== user.id)
      return NextResponse.json({ error: '본인이 등록한 관리구역만 수정할 수 있습니다' }, { status: 403 });

    // 점검개소명: 배열 또는 쉼표 문자열 허용
    let panelNames: string[] | null | undefined = undefined;
    if (body.panel_names !== undefined) {
      const raw = Array.isArray(body.panel_names)
        ? body.panel_names
        : String(body.panel_names || '').split(',');
      const cleaned = raw.map((s: string) => String(s).trim()).filter(Boolean);
      panelNames = cleaned.length ? cleaned : null;
    }

    const name = body.name !== undefined ? String(body.name).trim() : undefined;
    if (name !== undefined && !name)
      return NextResponse.json({ error: '현장명은 비울 수 없습니다' }, { status: 400 });

    // stations 컬럼 갱신 (제공된 값만)
    const patch: Record<string, any> = {};
    if (name !== undefined) { patch.name = name; patch.base_name = name; }
    if (body.voltage !== undefined && body.voltage !== '') patch.voltage = Number(body.voltage) || target.voltage;
    if (body.capacity !== undefined && body.capacity !== '') patch.capacity = Number(body.capacity);
    if (body.panel_count !== undefined && body.panel_count !== '') patch.panel_count = Math.max(1, Number(body.panel_count) || 1);

    // custom_values 병합 (기존 보존 + 변경분만 덮어쓰기)
    const cv = { ...(target.custom_values || {}) };
    if (body.sector_label !== undefined) cv.sector_label = String(body.sector_label).trim();
    if (body.notes !== undefined) cv.notes = String(body.notes);
    if (panelNames !== undefined) cv.panel_names = panelNames;
    patch.custom_values = cv;

    const { data: updated, error: upErr } = await supabase
      .from('stations').update(patch).eq('id', id).select('*').single();
    if (upErr) throw new Error('수정 실패: ' + upErr.message);

    return NextResponse.json({ success: true, station: updated });
  } catch (e: any) {
    console.error('[stations/update] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
