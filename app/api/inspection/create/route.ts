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

    const { data: station, error: stErr } = await supabase
      .from('stations').select('*').eq('id', station_id).single();
    if (stErr || !station) throw new Error('충전소 정보를 찾을 수 없습니다');

    const isHighV = station.voltage >= 3000;
    const templateUrl = `${process.env.NEXT_PUBLIC_APP_URL}/templates/template_${isHighV ? '고압' : '저압'}.xlsx`;
    const tplRes = await fetch(templateUrl);
    if (!tplRes.ok) throw new Error('템플릿 로드 실패');
    const tplBuffer = await tplRes.arrayBuffer();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(tplBuffer);

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

    const buffer = await wb.xlsx.writeBuffer();
    
    // 사용자에게 보여줄 파일명 (한글)
    const displayFileName = `${station.base_name}_${inspection_type}점검_${date}.xlsx`;
    
    // Storage 저장용 파일명 (영문/숫자, station_id 사용)
    const typeMap: any = { '월차': 'monthly', '분기': 'quarterly', '반기': 'semiannual', '연차': 'annual' };
const safePath = `${station.id}/${date.slice(0,7)}/${typeMap[inspection_type] || 'monthly'}/${date}.xlsx`;

    const { error: upErr } = await supabase.storage
      .from('inspections')
      .upload(safePath, buffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true,
      });
    if (upErr) {
      console.error('업로드 오류:', upErr);
      throw new Error(`Storage 업로드 실패: ${upErr.message}`);
    }

    const { data: urlData } = supabase.storage
      .from('inspections')
      .getPublicUrl(safePath);

    const { error: dbErr } = await supabase.from('inspections').insert({
      station_id,
      inspection_type,
      inspection_date: date,
      inspector_name,
      measure_values: measures,
      remarks: remarks || '특이사항없음',
      file_name: displayFileName,
      file_path: urlData.publicUrl,
      status: 'completed',
    });
    if (dbErr) {
      console.error('DB 저장 오류:', dbErr);
      throw new Error(`DB 저장 실패: ${dbErr.message}`);
    }

    return NextResponse.json({ 
      success: true, 
      fileName: displayFileName, 
      downloadUrl: urlData.publicUrl 
    });
  } catch (e: any) {
    console.error('점검 생성 오류:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}