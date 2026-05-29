import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import ExcelJS from 'exceljs';

// 개소별 엑셀 셀 매핑 정의 (수배전반 #1, #2, #3 ...)
// 실제 엑셀 템플릿의 셀 위치에 맞게 조정하세요
const CELL_MAP: Array<{
    v: { A: string; B: string; C: string; N: string };
    i: { A: string; B: string; C: string };
}> = [
  { v: { A: 'R13', B: 'R14', C: 'R16', N: 'R19' }, i: { A: 'T13', B: 'T14', C: 'T16' } },
  { v: { A: 'R23', B: 'R24', C: 'R26', N: 'R29' }, i: { A: 'T23', B: 'T24', C: 'T26' } },
  { v: { A: 'R33', B: 'R34', C: 'R36', N: 'R39' }, i: { A: 'T33', B: 'T34', C: 'T36' } },
  ];

export async function POST(req: NextRequest) {
    try {
          const body = await req.json();
          const {
                  station_id, inspection_type, date,
                  inspector_name, count, remarks,
                  measure_sets,
          } = body;

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

      // 측정값 배열 정규화 (이전 단일 포맷 호환)
      let sets: any[] = [];
          if (Array.isArray(measure_sets) && measure_sets.length > 0) {
                  sets = measure_sets;
          } else {
                  // 하위 호환: 기존 단일 measure 포맷
            const legacyMeasures = body;
                  sets = [{
                            voltage_A: legacyMeasures.voltage_A1 ?? '',
                            voltage_B: legacyMeasures.voltage_B1 ?? '',
                            voltage_C: legacyMeasures.voltage_C1 ?? '',
                            voltage_N: legacyMeasures.voltage_N1 ?? '',
                            current_A: legacyMeasures.current_A1 ?? '',
                            current_B: legacyMeasures.current_B1 ?? '',
                            current_C: legacyMeasures.current_C1 ?? '',
                            remarks: '',
                  }];
          }

      // 별지1 시트 — 개소별 동적 매핑
      const ws1 = wb.getWorksheet('별지1- 전기설비점검기록표') || wb.worksheets[0];
          if (ws1) {
                  ws1.getCell('B2').value = station.name;
                  ws1.getCell('B5').value = `${station.voltage}V`;
                  ws1.getCell('D5').value = `${station.capacity}kW`;
                  ws1.getCell('B6').value = date.replace(/-/g, '');
                  ws1.getCell('J6').value = count || 1;
                  ws1.getCell('T3').value = inspector_name;

            // 개소별 측정값 동적 매핑
            sets.forEach((set, idx) => {
                      const map = CELL_MAP[idx];
                      if (!map) return;

                                 const toNum = (v: any) => (v !== '' && v !== null && v !== undefined) ? Number(v) : '';

                                 ws1.getCell(map.v.A).value = toNum(set.voltage_A);
                      ws1.getCell(map.v.B).value = toNum(set.voltage_B);
                      ws1.getCell(map.v.C).value = toNum(set.voltage_C);
                      ws1.getCell(map.v.N).value = toNum(set.voltage_N);
                      ws1.getCell(map.i.A).value = toNum(set.current_A);
                      ws1.getCell(map.i.B).value = toNum(set.current_B);
                      ws1.getCell(map.i.C).value = toNum(set.current_C);
            });

            // 특이사항: 별지1에는 개소별 특이사항만 (전체 종합의견은 별지14로만)
            const panelRemarks = sets
              .map((s, i) => s.remarks ? `#${i + 1}: ${s.remarks}` : '')
              .filter(Boolean)
              .join(' / ') || '특이사항없음';
            ws1.getCell('A50').value = panelRemarks;

        // ​저압 설비 판정(C열) 고정값 — 별지1호 양식에 맞게 강제 설정
        if (!isHighV) {
          const O = '\u25CB'; // 적합
          const X = '/'; // 해당없음
          // 저압설비 판정(C열)
          const lowVerdicts: Record<string, string> = {
            C13: O, C14: O,                 // 인입구배선
            C15: O, C16: O,                 // 배·분전반
            C17: O, C18: O, C19: O,         // 배선용차단기
            C20: O, C21: O,                 // 누전차단기
            C22: O, C23: O,                 // 개폐기
            C24: O, C25: O, C26: O,         // 배선
            C27: X, C28: X,                 // 전동기
            C29: O, C30: O,                 // 전열설비
            C31: X, C32: X, C33: X,         // 용접기
            C34: X, C35: X,                 // 커패시터
            C36: O, C37: O,                 // 조명설비
            C38: X, C39: X,                 // 구내전선로
            C40: O, C41: O,                 // 기타설비
            C42: X, C43: X,                 // 발전기
            C44: X,                         // 차단장치
            C45: X, C46: X,                 // 축전장치
          };
          for (const [addr, mark] of Object.entries(lowVerdicts)) {
            ws1.getCell(addr).value = mark;
          }
        }
          }

      // 별지14 시트
      const ws14 = wb.getWorksheet('별지14-충전기설비');
          if (ws14) {
                  const d = new Date(date);
                  const yy = String(d.getFullYear()).slice(2);
                  const mm = String(d.getMonth() + 1).padStart(2, '0');
                  const dd = String(d.getDate()).padStart(2, '0');
                  ws14.getCell('G4').value = `${yy}년${mm}월${dd}일`;
                  ws14.getCell('C5').value = inspector_name;
                  ws14.getCell('C7').value = station.name;
                  ws14.getCell('C8').value = isHighV
                    ? `${station.voltage.toLocaleString()}[V] / ${station.capacity}[㎾]`
                            : `${station.voltage}[V]/ ${station.capacity}[㎾]`;
                  ws14.getCell('C38').value = remarks || '특이사항없음';
          }

      const buffer = await wb.xlsx.writeBuffer();
          const dateNum = date.replace(/-/g, '');
          const displayFileName = `${station.name}_${inspection_type}점검_${dateNum}.xlsx`;

      const [year, month] = date.split('-');
          const isKintex = station.base_name.includes('KINTEX') || station.base_name.includes('킨텍스');
          const voltageType = isHighV ? '고압' : '저압';

      const folderInfo = {
              base_name: station.base_name,
              year: `${year}년`,
              month: `${month}월`,
              inspection_type: `${inspection_type}점검`,
              is_kintex: isKintex,
              voltage_type: voltageType,
      };

      const typeMap: any = { '월차': 'monthly', '분기': 'quarterly', '반기': 'semiannual', '연차': 'annual' };
          const safePath = `${station.id}/${date.slice(0, 7)}/${typeMap[inspection_type] || 'monthly'}/${date}.xlsx`;

      const { error: upErr } = await supabase.storage
            .from('inspections')
            .upload(safePath, buffer, {
                      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                      upsert: true,
            });
          if (upErr) throw new Error(`Storage 업로드 실패: ${upErr.message}`);

      const { data: urlData } = supabase.storage
            .from('inspections')
            .getPublicUrl(safePath);

      // DB 저장 — 개소별 배열 구조로 저장
      const { error: dbErr } = await supabase.from('inspections').insert({
              station_id,
              inspection_type,
              inspection_date: date,
              inspector_name,
              measure_values: { sets },
              remarks: remarks || '특이사항없음',
              file_name: displayFileName,
              file_path: urlData.publicUrl,
              status: 'completed',
      });
          if (dbErr) throw new Error(`DB 저장 실패: ${dbErr.message}`);

      const base64 = Buffer.from(buffer).toString('base64');

      return NextResponse.json({
              success: true,
              fileName: displayFileName,
              downloadUrl: urlData.publicUrl,
              fileBase64: base64,
              folderInfo,
      });
    } catch (e: any) {
          console.error('점검 생성 오류:', e);
          return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
