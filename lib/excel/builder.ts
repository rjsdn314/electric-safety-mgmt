// ============================================================
// lib/excel/builder.ts
// 실제 엑셀 파일 생성 — 기존 양식 완전 보존, 값만 입력
// ============================================================
import ExcelJS from 'exceljs';

export interface InspectionData {
  station_name: string;
  voltage: string;             // "22900V" or "380V"
  capacity: string;            // "600KW"
  is_high_voltage: boolean;

  date: string;                // YYYY-MM-DD
  inspection_type: '월차' | '분기' | '반기' | '연차';
  count: number;

  inspector_name: string;
  company_name: string;

  voltage_A1?: number;
  voltage_B1?: number;
  voltage_C1?: number;
  voltage_N1?: number;
  current_A1?: number;
  current_B1?: number;
  current_C1?: number;

  charger_info?: string;
  charger_voltage_capacity?: string;
  charger_maker?: string;
  charger_model?: string;
  insulation_resistance?: string;

  remarks: string;
}

function toDateInt(d: string): number {
  return parseInt(d.replace(/-/g, ''));
}

function toKoreanDate(d: string): string {
  const [y, m, day] = d.split('-');
  return `${y.slice(2)}년${m}월${day}일`;
}

function writeCell(ws: ExcelJS.Worksheet, addr: string, value: string | number | null) {
  ws.getCell(addr).value = value;
}

export function fillByeolji1(ws: ExcelJS.Worksheet, d: InspectionData) {
  writeCell(ws, 'B2',  d.station_name);
  writeCell(ws, 'T3',  d.inspector_name);
  writeCell(ws, 'B5',  d.voltage);
  writeCell(ws, 'D5',  d.capacity);
  writeCell(ws, 'B6',  toDateInt(d.date));
  writeCell(ws, 'J6',  d.count);
  writeCell(ws, 'R13', d.voltage_A1 ?? '');
  writeCell(ws, 'R14', d.voltage_B1 ?? '');
  writeCell(ws, 'R16', d.voltage_C1 ?? '');
  writeCell(ws, 'R19', d.voltage_N1 ?? '');
  writeCell(ws, 'T13', d.current_A1 ?? '');
  writeCell(ws, 'T14', d.current_B1 ?? '');
  writeCell(ws, 'T16', d.current_C1 ?? '');
  writeCell(ws, 'A50', d.remarks || '특이사항없음');
  writeCell(ws, 'V60', d.inspector_name);
}

export function fillByeolji14(ws: ExcelJS.Worksheet, d: InspectionData) {
  writeCell(ws, 'G4', toKoreanDate(d.date));
  const inspLine =
    `(소 속)${d.company_name}/                                          ` +
    `(성 명)   ${d.inspector_name}            (서명)`;
  writeCell(ws, 'C5', inspLine);
  writeCell(ws, 'C7', d.station_name);
  const vNum = parseInt(d.voltage.replace(/[^0-9]/g, ''));
  const cNum = d.capacity.replace(/[^0-9]/g, '');
  const vStr = d.is_high_voltage
    ? `${vNum.toLocaleString()}[V] / ${cNum}[㎾]`
    : `${vNum}[V]/ ${cNum}[㎾]`;
  writeCell(ws, 'C8',  vStr);
  if (d.charger_info)             writeCell(ws, 'C9',  d.charger_info);
  if (d.charger_voltage_capacity) writeCell(ws, 'E12', d.charger_voltage_capacity);
  if (d.charger_maker)            writeCell(ws, 'E13', d.charger_maker);
  if (d.charger_model)            writeCell(ws, 'H13', d.charger_model);
  writeCell(ws, 'K36', d.insulation_resistance || '-');
  writeCell(ws, 'C38', d.remarks || '특이사항없음');
}

export async function buildInspectionExcel(
  data: InspectionData,
  templateBuffer: ArrayBuffer
): Promise<{ buffer: Buffer; fileName: string }> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(templateBuffer);

  const ws1 = workbook.getWorksheet('별지1- 전기설비점검기록표');
  if (ws1) fillByeolji1(ws1, data);

  const ws14 = workbook.getWorksheet('별지14-충전기설비');
  if (ws14) fillByeolji14(ws14, data);

  const buffer = await workbook.xlsx.writeBuffer();
  const fileName = `${data.station_name}_${data.inspection_type}점검_${data.date}.xlsx`;
  return { buffer: Buffer.from(buffer), fileName };
}
