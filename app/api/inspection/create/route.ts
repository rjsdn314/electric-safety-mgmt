// ============================================================
// app/api/inspection/create/route.ts  (v3.3)
// 점검표 생성 — 충전소별 등록 양식 우선 사용
//  · 분기/반기/연차: station_templates 전용 양식 → XML 직접수정 엔진(buildInspectionXlsx)
//    으로 생성 → 원본 테두리/서식 100% 보존 + 접지저항 입력 반영(반기·연차)
//  · 월차(또는 등록양식 없음): 기존 공용 고압/저압 템플릿 + ExcelJS 폴백
// ============================================================
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { fillWorkbook, InspectionData } from '@/lib/excel/builder';
import { buildInspectionXlsx } from '@/lib/excel/xmlFill';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      station_id, inspection_type, date,
      inspector_name, count, remarks,
      measure_sets, ground_resistance, is_mobile,
    } = body;

    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: station, error: stErr } = await sb
      .from('stations').select('*').eq('id', station_id).single();
    if (stErr || !station) throw new Error('충전소 정보를 찾을 수 없습니다');

    const isHighV = Number(station.voltage) >= 3000;

    let sets: any[] = Array.isArray(measure_sets) && measure_sets.length ? measure_sets : [{
      voltage_A: body.voltage_A1 ?? '', voltage_B: body.voltage_B1 ?? '',
      voltage_C: body.voltage_C1 ?? '', voltage_N: body.voltage_N1 ?? '',
      current_A: body.current_A1 ?? '', current_B: body.current_B1 ?? '',
      current_C: body.current_C1 ?? '', remarks: '',
    }];
    // 접지저항: 위치(수배전반 #N → D5+N) 보존을 위해 빈 값도 그대로 전달.
    // xmlFill이 인덱스별로 빈 칸은 건너뛰고 채운다.
    // ※ 분기점검은 운영 기준상 접지저항 측정 제외 → 값을 강제로 비운다.
    //   반기·연차점검만 접지저항을 채운다.
    const ground: any[] =
      (inspection_type === '반기' || inspection_type === '연차') && Array.isArray(ground_resistance)
        ? ground_resistance : [];

    // ── 양식 내 치환할 기존 안전관리자명 (DB settings.manager_name, 기본값 황건우) ──
    // 등록 양식 파일에 인쇄돼 있는 고정 이름을 로그인 계정명으로 바꾸기 위함.
    let replaceNames: string[] = ['황건우'];
    try {
      const { data: mn } = await sb.from('settings').select('value').eq('key', 'manager_name').maybeSingle();
      if (mn?.value && !replaceNames.includes(mn.value)) replaceNames.push(mn.value);
    } catch { /* settings 없어도 기본값 사용 */ }

    // ── 양식 소스 결정 ──
    // 점검종별 → 양식 그룹 매핑. 분기는 분기 전용 양식, 반기는 반기 전용 양식(별지2 포함)을 사용.
    let tplBuffer: ArrayBuffer | null = null;
    let usedRegistered = false;

    if (inspection_type === '분기' || inspection_type === '반기' || inspection_type === '연차') {
      // 1순위: 해당 종별 전용 그룹 양식 → 2순위(구버전 호환): '분기' 그룹 양식
      // 연차는 충전소별 전용 연차 양식(모든 별지 + 별지2 접지저항 포함)만 사용.
      const groupCandidates =
        inspection_type === '반기' ? ['반기', '분기'] :
        inspection_type === '연차' ? ['연차'] : ['분기'];
      for (const grp of groupCandidates) {
        const { data: tpl } = await sb
          .from('station_templates')
          .select('file_path')
          .eq('station_id', station_id)
          .eq('inspection_group', grp)
          .maybeSingle();
        if (tpl?.file_path) {
          const { data: dl, error: dlErr } = await sb.storage.from('templates').download(tpl.file_path);
          if (!dlErr && dl) { tplBuffer = await dl.arrayBuffer(); usedRegistered = true; break; }
        }
      }
    }

    if (!tplBuffer) {
      const templateUrl = `${process.env.NEXT_PUBLIC_APP_URL}/templates/template_${isHighV ? '고압' : '저압'}.xlsx`;
      const tplRes = await fetch(templateUrl);
      if (!tplRes.ok) throw new Error(`템플릿 로드 실패 (${usedRegistered ? '등록양식' : '공용양식'})`);
      tplBuffer = await tplRes.arrayBuffer();
    }

    // ── 생성 ──
    let buffer: Buffer;
    if (usedRegistered) {
      // XML 직접수정: 원본 서식/테두리 보존
      buffer = await buildInspectionXlsx(tplBuffer, {
        station_name: station.name,
        voltage: `${station.voltage}V`,
        capacity: `${station.capacity}KW`,
        is_high_voltage: isHighV,
        date, inspection_type, count: count || 1, inspector_name,
        company_name: '',
        measure_sets: sets,
        ground_resistance: ground,
        replace_names: replaceNames,
        remarks: remarks || '특이사항없음',
      });
    } else {
      // 공용 폴백: 기존 ExcelJS 경로
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(tplBuffer);
      const data: InspectionData = {
        station_name: station.name,
        voltage: `${station.voltage}V`,
        capacity: `${station.capacity}KW`,
        is_high_voltage: isHighV,
        date, inspection_type, count: count || 1, inspector_name,
        company_name: '',
        measure_sets: sets,
        remarks: remarks || '특이사항없음',
      };
      fillWorkbook(wb, data, { forceLowVerdicts: true, replaceNames });
      buffer = Buffer.from(await wb.xlsx.writeBuffer());
    }

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
      measure_values: { sets, ground_resistance: ground, device: is_mobile ? 'mobile' : 'pc', used_registered_template: usedRegistered },
      remarks: remarks || '특이사항없음',
      file_name: displayFileName,
      file_path: urlData.publicUrl,
      status: 'completed',
    });
    if (dbErr) throw new Error(`DB 저장 실패: ${dbErr.message}`);

    const [year, month] = date.split('-');
    return NextResponse.json({
      success: true,
      fileName: displayFileName,
      downloadUrl: urlData.publicUrl,
      fileBase64: Buffer.from(buffer).toString('base64'),
      usedRegisteredTemplate: usedRegistered,
      folderInfo: {
        base_name: station.base_name,
        year: `${year}년`, month: `${month}월`,
        inspection_type: `${inspection_type}점검`,
        voltage_type: isHighV ? '고압' : '저압',
      },
    });
  } catch (e: any) {
    console.error('점검 생성 오류:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
