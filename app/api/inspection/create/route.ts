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
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { station_id, inspection_type, date, inspector_name, count, remarks, ...measures } = body;

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1. 충전소 정보 조회
    const { data: station, error: stErr } = await supabase
      .from('stations').select('*').eq('id', station_id).single();
    if (stErr || !station) throw new Error('충전소 정보를 찾을 수 없습니다');

    // 2. 엑셀 템플릿 로드
    const isHighV = station.voltage >= 3000;
    const templateUrl = `${process.env.NEXT_PUBLIC_APP_URL}/templates/template_${isHighV ? '고압' : '저압'}.xlsx`;
    const tplRes = await fetch(templateUrl);
    if (!tplRes.ok) throw new Error('템플릿 로드 실패');
    const tplBuffer = await tplRes.arrayBuffer();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(tplBuffer);

    // 3. 별지1 셀 채우기
    const ws1 = wb.getWorksheet('별지1- 전기설비점검기록표') || wb.worksheets[0];
    if (ws1) {
      ws1.getCell('B2').value = station.name;
      ws1.getCell('B5').value = `${station.voltage}V`;
      ws1.getCell('D5').value = `${station.capacity}kW`;
      ws1.getCell('B6').value = date.replace(/-/g, '');
      ws1.getCell('J6').value = count || 1;
      ws1.getCell('R13').value = measures.voltage_A1 || '';
      ws1.getCell('R14').value = measures.voltage_B1 || '';
      ws1.getCell('R16').value = measures.voltage_C1 || '';
      ws1.getCell('R19').value = measures.voltage_N1 || '';
      ws1.getCell('T13').value = measures.current_A1 || '';
      ws1.getCell('T14').value = measures.current_B1 || '';
      ws1.getCell('T16').value = measures.current_C1 || '';
      ws1.getCell('A50').value = remarks || '특이사항없음';
      ws1.getCell('T3').value = inspector_name;
    }

    // 4. 별지14 셀 채우기
    const ws14 = wb.getWorksheet('별지14-충전기설비');
    if (ws14) {
      const d = new Date(date);
      const yy = String(d.getFullYear()).slice(2);
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      ws14.getCell('G4').value = `${yy}년${mm}월${dd}일`;
      ws14.getCell('C5').value = inspector_name;
      ws14.getCell('C7').value = station.address || station.name;
      ws14.getCell('C8').value = isHighV
        ? `${station.voltage.toLocaleString()}[V] / ${station.capacity}[㎾]`
        : `${station.voltage}[V]/ ${station.capacity}[㎾]`;
      ws14.getCell('C38').value = remarks || '특이사항없음';
    }

    // 5. 엑셀 버퍼 생성
    const buffer = await wb.xlsx.writeBuffer();
    const fileName = `${station.base_name}_${inspection_type}점검_${date}.xlsx`;
    const filePath = `${station.base_name}/${date.slice(0,7)}/${inspection_type}점검/${fileName}`;

    // 6. Storage에 업로드
    const { error: upErr } = await supabase.storage
      .from('inspections')
      .upload(filePath, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });
    if (upErr) console.error('업로드 오류:', upErr);

    // 7. 다운로드 URL 생성
    const { data: urlData } = supabase.storage
      .from('inspections')
      .getPublicUrl(filePath);

    // 8. 점검 이력 DB 저장
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('inspections').insert({
      user_id: user?.id,
      station_id,
      inspection_type,
      inspection_date: date,
      inspector_name,
      measure_values: measures,
      remarks: remarks || '특이사항없음',
      file_name: fileName,
      file_path: urlData.publicUrl,
      status: 'completed',
    });

    return NextResponse.json({ success: true, fileName, downloadUrl: urlData.publicUrl });
  } catch (e: any) {
    console.error('점검 생성 오류:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
