import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import ExcelJS from 'exceljs';

// ============================================================
// POST /api/stations/upload
// 관리구역 등록용 엑셀 파일 업로드 → stations 테이블 insert
// FormData: { file: xlsx, sector_name: string }
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 요청자 인증
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: '인증 실패' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles').select('id, status, role').eq('id', user.id).single();
    if (profile?.status !== 'approved')
      return NextResponse.json({ error: '승인된 계정만 이용 가능합니다' }, { status: 403 });

    // FormData 파싱
    const formData = await req.formData();
    const file     = formData.get('file') as File | null;
    const sectorName = (formData.get('sector_name') as string) || '기본구역';

    if (!file) return NextResponse.json({ error: '파일이 없습니다' }, { status: 400 });

    // 섹터 찾기 또는 생성
    let sectorId: string;
    const { data: existSector } = await supabase
      .from('sectors').select('id').eq('name', sectorName).single();

    if (existSector) {
      sectorId = existSector.id;
    } else {
      const { data: newSector, error: secErr } = await supabase
        .from('sectors').insert({ name: sectorName }).select('id').single();
      if (secErr) throw new Error('섹터 생성 실패: ' + secErr.message);
      sectorId = newSector!.id;
    }

    // 사용자 sector_id 업데이트 (미설정 시)
    const { data: currentProfile } = await supabase
      .from('profiles').select('sector_id').eq('id', user.id).single();
    if (!currentProfile?.sector_id) {
      await supabase.from('profiles').update({ sector_id: sectorId }).eq('id', user.id);
    }

    // 엑셀 파싱
    const buffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);

    const ws = wb.worksheets[0];
    if (!ws) return NextResponse.json({ error: '시트를 찾을 수 없습니다' }, { status: 400 });

    const rows: any[] = [];
    const errors: string[] = [];

    ws.eachRow((row, rowNum) => {
      if (rowNum <= 2) return; // 헤더 2행 스킵

      const cells = row.values as any[];
      // 컬럼 순서(A~I): [담당자명, 현장명, 관리구역명, 수전전압, 계약용량, 수배전반개수, 측정개소명, 기본점검양식, 비고]
      // row.values 는 1-based (index 0 은 비어있음) → 첫 항목만 건너뜀
      const [, inspectorName, stationName, sectorLabel, voltage, capacity, panelCount, panelNamesRaw, defaultType, notes] = cells;

      if (!stationName) return; // 빈 행 스킵

      const panelNames = panelNamesRaw
        ? String(panelNamesRaw).split(/[,、/]/).map((s: string) => s.trim()).filter(Boolean)
        : [];

      rows.push({
        sector_id:    sectorId,
        user_id:      user.id,
        name:         String(stationName).trim(),
        base_name:    String(stationName).trim(), // 트리거로 자동 설정되지만 명시
        voltage:      Number(voltage) || 22900,
        capacity:     Number(capacity) || 0,
        panel_count:  Number(panelCount) || panelNames.length || 1,
        panel_names:  panelNames.length > 0 ? panelNames : null,
        default_type: String(defaultType || '월차').trim(),
        custom_values: {
          inspector_name: String(inspectorName || '').trim(),
          sector_label:   String(sectorLabel || sectorName).trim(),
          notes:          String(notes || '').trim(),
        },
        is_active:  true,
      });
    });

    if (rows.length === 0) {
      return NextResponse.json({ error: '등록할 데이터가 없습니다 (3행부터 데이터 입력 필요)' }, { status: 400 });
    }

    // 기존 해당 사용자 충전소 삭제 후 재등록 (upsert 방식)
    await supabase.from('stations').delete()
      .eq('user_id', user.id)
      .eq('sector_id', sectorId);

    const { error: insertErr } = await supabase.from('stations').insert(rows);
    if (insertErr) throw new Error('충전소 등록 실패: ' + insertErr.message);

    // 업로드 이력 저장
    await supabase.from('station_uploads').insert({
      user_id:    user.id,
      file_name:  file.name,
      row_count:  rows.length,
      status:     'completed',
    });

    return NextResponse.json({
      success:   true,
      inserted:  rows.length,
      sectorId,
      sectorName,
    });
  } catch (e: any) {
    console.error('[stations/upload] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
