// ============================================================
// app/api/thermal/station-parts/route.ts
// 현장별 열화상 부위 목록 (양식·설비가 계정 기본과 다른 현장용, 예: 내린천 VCB/PT/CH)
//  · 목록 순서 = 별지7 온도 행(13·15·17) 순서. 생성/반영 시 엑셀 행·사진 라벨도 이 이름으로 바뀐다.
//  GET    ?station_id=     → { parts: ThermalPart[] | null }  (null = 계정 기본 사용)
//  POST   { station_id, parts } → 저장 (설명이 비면 계정 목록/기본 특징으로 채움)
//  DELETE ?station_id=     → 현장별 설정 해제
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getRouteUser } from '@/lib/supabase/route-user';
import { DEFAULT_PARTS, describePart, sanitizeParts } from '@/lib/thermal/parts';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const user = await getRouteUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    const stationId = new URL(req.url).searchParams.get('station_id');
    if (!stationId) return NextResponse.json({ parts: null });
    const { data } = await createClient().from('thermal_station_parts').select('parts').eq('station_id', stationId).maybeSingle();
    const parts = sanitizeParts(data?.parts);
    return NextResponse.json({ parts: parts.length ? parts : null });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getRouteUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    const { station_id, parts: raw } = await req.json();
    if (!station_id) return NextResponse.json({ error: '현장 정보가 없습니다' }, { status: 400 });
    const sb = createClient();
    const { data: prof } = await sb.from('thermal_part_profiles').select('parts').eq('user_id', user.id).maybeSingle();
    const account = sanitizeParts(prof?.parts);
    const parts = sanitizeParts(raw).map((p) => ({ ...p, desc: p.desc || describePart(p.name, account.length ? account : DEFAULT_PARTS) }));
    if (!parts.length) return NextResponse.json({ error: '부위를 하나 이상 입력해주세요' }, { status: 400 });
    const { error } = await sb.from('thermal_station_parts')
      .upsert({ station_id, parts, updated_by: user.id, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return NextResponse.json({ parts });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getRouteUser();
    if (!user) return NextResponse.json({ error: '로그인이 필요합니다' }, { status: 401 });
    const stationId = new URL(req.url).searchParams.get('station_id');
    if (!stationId) return NextResponse.json({ error: '현장 정보가 없습니다' }, { status: 400 });
    const { error } = await createClient().from('thermal_station_parts').delete().eq('station_id', stationId);
    if (error) throw new Error(error.message);
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
