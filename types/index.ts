// ============================================================
// types/index.ts — 전체 타입 정의 (단일 파일로 관리)
// ============================================================

// ────────────────────────────────────────
// 사용자 / 섹터
// ────────────────────────────────────────
export type UserRole = 'admin' | 'user';

export interface Sector {
  id: string;
  name: string;
  created_at: string;
}

export interface Profile {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  sector_id: string | null;
  sector?: Sector;
  created_at: string;
  updated_at: string;
}

// ────────────────────────────────────────
// 충전소
// ────────────────────────────────────────
export interface Station {
  id: string;
  sector_id: string;
  name: string;          // 예: '장유휴게소-01'
  base_name: string;     // 예: '장유휴게소'
  address: string;
  management_type: string;
  voltage: number;       // 수전전압 (V)
  capacity: number;      // 수전용량 (kW)
  equipment_info: Record<string, unknown>;
  custom_values: Record<string, string | number>;
  is_active: boolean;
}

// 그룹핑된 충전소 (base_name 기준)
export interface StationGroup {
  base_name: string;
  unit_count: number;
  total_capacity: number;
  voltage: number;
  station_ids: string[];
  station_names: string[];
}

// ────────────────────────────────────────
// 점검
// ────────────────────────────────────────
export type InspectionType = '월차' | '분기' | '반기' | '연차';

export interface MeasureValues {
  voltage_r?: number;    // R상 전압
  voltage_s?: number;    // S상 전압
  voltage_t?: number;    // T상 전압
  current_r?: number;    // R상 전류
  current_s?: number;    // S상 전류
  current_t?: number;    // T상 전류
  [key: string]: number | undefined; // 확장 가능
}

export interface Inspection {
  id: string;
  user_id: string;
  station_id: string;
  inspection_type: InspectionType;
  inspection_date: string;   // YYYY-MM-DD
  inspector_name: string;
  measure_values: MeasureValues;
  remarks: string;
  file_path: string;
  file_name: string;
  status: 'draft' | 'completed';
  created_at: string;
  station?: Station;
}

// ────────────────────────────────────────
// 점검 생성 입력값 (폼 데이터)
// ────────────────────────────────────────
export interface InspectionFormData {
  station_id: string;
  inspection_type: InspectionType;
  inspection_date: string;
  inspector_name: string;
  measure_values: MeasureValues;
  remarks: string;
}

// ────────────────────────────────────────
// Excel 생성 관련
// ────────────────────────────────────────
export interface ExcelBuildContext {
  station: Station;
  stationGroup: StationGroup;
  inspection: InspectionFormData;
  profile: Profile;
  settings: Record<string, string>;
  sheetConfig: SheetConfig[];
}

export interface SheetConfig {
  sheetName: string;      // 예: '별지1'
  templateSheet: string;  // 템플릿 내 시트명
  fields: CellField[];    // 입력할 셀 목록
}

export interface CellField {
  cell: string;           // 예: 'B3'
  source: CellValueSource;
  value?: string | number; // 고정값인 경우
}

// 셀 값 출처 지정
export type CellValueSource =
  | { type: 'static'; value: string | number }
  | { type: 'station'; key: keyof Station }
  | { type: 'inspection'; key: keyof InspectionFormData }
  | { type: 'measure'; key: keyof MeasureValues }
  | { type: 'setting'; key: string }
  | { type: 'computed'; fn: string }; // 계산값 (합산 등)

// ────────────────────────────────────────
// Config JSON 타입
// ────────────────────────────────────────
export interface InspectionConfig {
  type: InspectionType;
  months: number[];       // 해당 점검이 진행되는 월
  sheets: string[];       // 작성할 시트 목록
  label: string;          // 화면 표시용
}

// ────────────────────────────────────────
// 시스템 설정
// ────────────────────────────────────────
export interface Setting {
  key: string;
  value: string;
  label: string;
  updated_at: string;
}
