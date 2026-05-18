-- ============================================================
-- DB_SCHEMA_추가.sql
-- 충전소 계정별 분리 + 충전기 상세정보 컬럼 추가
-- ============================================================

-- ── 기존 stations 테이블에 컬럼 추가 ────────────────────────
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS charger_info             TEXT,       -- "( 200 ) kW (1)기/(350) kW (1)기"
  ADD COLUMN IF NOT EXISTS charger_voltage_capacity TEXT,       -- "380V/400KW"
  ADD COLUMN IF NOT EXISTS charger_maker            TEXT,       -- "SK시그넷"
  ADD COLUMN IF NOT EXISTS charger_model            TEXT,       -- "200kW : CS20A3"
  ADD COLUMN IF NOT EXISTS insulation_resistance    TEXT DEFAULT '-'; -- 절연저항 기본값

-- ── 샘플 충전소 데이터 (계정/섹터 배정 예시) ─────────────────
-- 1. 먼저 섹터 생성
INSERT INTO sectors (name) VALUES
  ('영남권'), ('수도권'), ('충청권')
ON CONFLICT (name) DO NOTHING;

-- 2. 충전소 데이터 (sector_id는 실제 UUID로 교체)
-- 아래는 예시 구조이며 실제 운영 시 관리자 페이지에서 입력
/*
INSERT INTO stations (
  sector_id, name, base_name, address, management_type,
  voltage, capacity,
  charger_info, charger_voltage_capacity, charger_maker, charger_model
) VALUES
  -- 영남권 충전소
  ((SELECT id FROM sectors WHERE name='영남권'),
   '의성휴게소 청주방향', '의성휴게소 청주방향',
   '경북 의성군', '직접관리',
   22900, 600,
   '( 200 ) kW (1)기/(350) kW (1)기', '22900V/600KW', 'SK시그넷', '200kW : CS20A3'),

  -- 수도권 충전소
  ((SELECT id FROM sectors WHERE name='수도권'),
   '북한산 제1주차장', '북한산 제1주차장',
   '서울 강북구', '위탁관리',
   380, 442,
   '( 200 ) kW ( 2 )기/( 7 ) kW ( 6 )기', '380V/400KW', 'SK시그넷', '200KW : CS20A3'),

  -- 영남권 (내린천 → 강원권 예시)
  ((SELECT id FROM sectors WHERE name='영남권'),
   '내린천휴게소 서울방향', '내린천휴게소 서울방향',
   '강원 인제군', '직접관리',
   22900, 1100,
   '', '', '', '');
*/

-- ── 계정-섹터 연결 흐름 설명 ─────────────────────────────────
-- 1. 관리자가 /admin/users 에서 사용자 계정 생성
-- 2. 해당 계정에 sector_id 배정
-- 3. 각 충전소는 sector_id로 소속 섹터 지정
-- 4. RLS 정책에 의해 사용자는 자신의 sector_id 충전소만 보임
--    (DB_SCHEMA.sql의 "stations_sector" 정책 참고)

-- ── 계정별 충전소 접근 확인 쿼리 (디버깅용) ─────────────────
-- SELECT s.name, s.base_name, s.voltage, s.capacity
-- FROM stations s
-- JOIN profiles p ON p.sector_id = s.sector_id
-- WHERE p.id = auth.uid()
-- AND s.is_active = TRUE;

-- ── 엑셀 템플릿 파일 위치 안내 ───────────────────────────────
-- public/templates/template_고압.xlsx  ← 고압(22900V) 양식
-- public/templates/template_저압.xlsx  ← 저압(380V) 양식
--
-- 기존 엑셀 파일을 다음 이름으로 복사해서 배치:
--   고압월차예시.xlsx  →  public/templates/template_고압.xlsx
--   저압_월차_예시.xlsx →  public/templates/template_저압.xlsx
