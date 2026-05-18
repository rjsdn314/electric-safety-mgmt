// ============================================================
// app/api/inspection/create/route.ts
// 엑셀 생성 → 클라이언트에 Buffer 전송
// 저장은 클라이언트에서 File System Access API로 처리
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { buildInspectionExcel, InspectionData } from '@/lib/excel/builder';

export async function POST(req: NextRequest) {
  // 인증 확인
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const {
    station_id, inspection_type, date,
    inspector_name, count,
    voltage_A1, voltage_B1, voltage_C1, voltage_N1,
    current_A1, current_B1, current_C1,
    remarks,
  } = body;

  // 충전소 정보 조회
  const { data: station } = await supabase
    .from('stations')
    .select('*')
    .eq('id', station_id)
    .single();
  if (!station) return NextResponse.json({ error: '충전소 없음' }, { status: 404 });

  // 시스템 설정 조회
  const { data: settingsRows } = await supabase.from('settings').select('*');
  const settings: Record<string, string> = {};
  (settingsRows ?? []).forEach((s: any) => { settings[s.key] = s.value; });

  // 고압/저압 판별 (수전전압 22900V 이상이면 고압)
  const voltageNum = parseInt(String(station.voltage).replace(/[^0-9]/g, ''));
  const isHighVoltage = voltageNum >= 3000;

  // 템플릿 선택 (고압/저압)
  const templateName = isHighVoltage ? 'template_고압.xlsx' : 'template_저압.xlsx';
  const templateUrl = `${process.env.NEXT_PUBLIC_APP_URL}/templates/${templateName}`;
  const templateRes = await fetch(templateUrl);
  if (!templateRes.ok) {
    return NextResponse.json({ error: `템플릿 로드 실패: ${templateName}` }, { status: 500 });
  }
  const templateBuffer = await templateRes.arrayBuffer();

  // 충전소 custom_values에서 충전기 정보 가져오기
  const cv = station.custom_values || {};

  const inspectionData: InspectionData = {
    station_name: station.base_name,
    voltage: `${station.voltage}V`,
    capacity: `${station.capacity}KW`,
    is_high_voltage: isHighVoltage,
    date,
    inspection_type,
    count: count || 1,
    inspector_name,
    company_name: settings['company_name'] || '브라이트에너지파트너스',
    voltage_A1, voltage_B1, voltage_C1, voltage_N1,
    current_A1, current_B1, current_C1,
    charger_info: cv['charger_info'] || '',
    charger_voltage_capacity: cv['charger_voltage_capacity'] || '',
    charger_maker: cv['charger_maker'] || '',
    charger_model: cv['charger_model'] || '',
    insulation_resistance: cv['insulation_resistance'] || '-',
    remarks: remarks || '특이사항없음',
  };

  // 엑셀 생성
  const { buffer, fileName } = await buildInspectionExcel(inspectionData, templateBuffer);

  // Supabase Storage에도 백업 저장
  const [year, month] = date.split('-');
  const filePath = `users/${user.id}/inspections/${year}/${month}/${fileName}`;
  await supabase.storage
    .from('inspections')
    .upload(filePath, buffer, {
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      upsert: true,
    });

  // 점검이력 DB 저장
  await supabase.from('inspections').insert({
    user_id: user.id,
    station_id,
    inspection_type,
    inspection_date: date,
    inspector_name,
    measure_values: { voltage_A1, voltage_B1, voltage_C1, voltage_N1, current_A1, current_B1, current_C1 },
    remarks: remarks || '특이사항없음',
    file_path: filePath,
    file_name: fileName,
    status: 'completed',
  });

  // 엑셀 Buffer를 Base64로 인코딩해서 클라이언트 전송
  // (클라이언트에서 File System Access API로 저장)
  const base64 = buffer.toString('base64');

  return NextResponse.json({
    success: true,
    fileName,
    fileBase64: base64,
    // 폴더 경로 구조 정보 (클라이언트에서 폴더 생성에 사용)
    folderStructure: {
      stationName: station.base_name,
      year,
      month,
      inspectionType: inspection_type,
    },
  });
}
