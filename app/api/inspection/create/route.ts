// ============================================================
// app/api/inspection/create/route.ts  (v3)
// 점검표 생성 — 충전소별 등록 양식 우선 사용
//  · 분기/반기: station_templates에 등록된 전용 양식 사용 (없으면 공용 폴백)
//  · 월차/연차: 기존 공용 고압/저압 템플릿 사용 (저압 판정 자동입력)
// 별지1/14/7/2 모두 fillWorkbook으로 자동 처리 (별지7·별지2 다중 시트 포함)
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { fillWorkbook, InspectionData } from '@/lib/excel/builder';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      station_id, inspection_type, date,
      inspector_name, count, remarks,
      measure_sets, is_mobile,
    } = body;

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: station, error: stErr } = await sb
      .from('stations').select('*').eq('id', station_id).single();
    if (stErr || !station) throw new Error('충전소 정보를 찾을 수 없습니다');

    const isHighV = Number(station.voltage) >= 3000;

    // 측정값 정규화 (하위 호환)
    let sets: any[] = Array.isArray(measure_sets) && measure_sets.length ? measure_sets : [{
      voltage_A: body.voltage_A1 ?? '', voltage_B: body.voltage_B1 ?? '',
      voltage_C: body.voltage_C1 ?? '', voltage_N: body.voltage_N1 ?? '',
      current_A: body.current_A1 ?? '', current_B: body.current_B1 ?? '',
      current_C: body.current_C1 ?? '', remarks: '',
    }];

    // ── 양식 소스 결정 ──
    let tplBuffer: ArrayBuffer | null = null;
    let usedRegistered = false;

    if (inspection_type === '분기' || inspection_type === '반기') {
      // 분기/반기는 동일 등록 양식(inspection_group='분기') 사용
      const { data: tpl } = await sb
        .from('station_templates')
        .select('file_path')
        .eq('station_id', station_id)
        .eq('inspection_group', '분기')
        .maybeSingle();
      if (tpl?.file_path) {
        const { data: dl, error: dlErr } = await sb.storage.from('templates').download(tpl.file_path);
        if (!dlErr && dl) {
          tplBuffer = await dl.arrayBuffer();
          usedRegistered = true;
        }
      }
    }

    // 폴백: 공용 고압/저압 템플릿
    if (!tplBuffer) {
      const templateUrl = `${process.env.NEXT_PUBLIC_APP_URL}/templates/template_${isHighV ? '고압' : '저압'}.xlsx`;
      const tplRes = await fetch(templateUrl);
      if (!tplRes.ok) throw new Error(`템플릿 로드 실패 (${usedRegistered ? '등록양식' : '공용양식'})`);
      tplBuffer = await tplRes.arrayBuffer();
    }

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(tplBuffer);

    const data: InspectionData = {
      station_name: station.name,
      voltage: `${station.voltage}V`,
      capacity: `${station.capacity}KW`,
      is_high_voltage: isHighV,
      date,
      inspection_type,
      count: count || 1,
      inspector_name,
      company_name: '',           // 등록 양식의 소속을 보존하기 위해 비움
      measure_sets: sets,
      remarks: remarks || '특이사항없음',
    };

    // 등록 양식은 판정이 이미 채워져 있으므로 강제 입력하지 않음.
    // 공용 저압 폴백일 때만 저압 판정 자동입력(기존 동작 유지).
    fillWorkbook(wb, data, { forceLowVerdicts: !usedRegistered });

    const buffer = await wb.xlsx.writeBuffer();
    const dateNum = date.replace(/-/g, '');
    const displayFileName = `${station.name}_${inspection_type}점검_${dateNum}.xlsx`;

    const typeMap: any = { '월차': 'monthly', '분기': 'quarterly', '반기': 'semiannual', '연차': 'annual' };
    const safePath = `${station.id}/${date.slice(0, 7)}/${typeMap[inspection_type] || 'monthly'}/${date}.xlsx`;

    const { error: upErr } = await sb.storage
      .from('inspections')
      .upload(safePath, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });
    if (upErr) throw new Error(`Storage 업로드 실패: ${upErr.message}`);

    const { data: urlData } = sb.storage.from('inspections').getPublicUrl(safePath);

    const { error: dbErr } = await sb.from('inspections').insert({
      station_id,
      inspection_type,
      inspection_date: date,
      inspector_name,
      measure_values: { sets, device: is_mobile ? 'mobile' : 'pc', used_registered_template: usedRegistered },
      remarks: remarks || '특이사항없음',
      file_name: displayFileName,
      file_path: urlData.publicUrl,
      status: 'completed',
    });
    if (dbErr) throw new Error(`DB 저장 실패: ${dbErr.message}`);

    const [year, month] = date.split('-');
    const folderInfo = {
      base_name: station.base_name,
      year: `${year}년`, month: `${month}월`,
      inspection_type: `${inspection_type}점검`,
      voltage_type: isHighV ? '고압' : '저압',
    };

    return NextResponse.json({
      success: true,
      fileName: displayFileName,
      downloadUrl: urlData.publicUrl,
      fileBase64: Buffer.from(buffer).toString('base64'),
      usedRegisteredTemplate: usedRegistered,
      folderInfo,
    });
  } catch (e: any) {
    console.error('점검 생성 오류:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
