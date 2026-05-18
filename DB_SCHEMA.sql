-- ============================================================
-- 전기안전관리 자동화 웹앱 — Supabase DB 설계
-- Supabase SQL Editor에 순서대로 실행하세요
-- ============================================================

-- ────────────────────────────────────────
-- 0. 확장 모듈
-- ────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────
-- 1. 섹터 (sectors)
--    수도권 / 충청권 / 영남권 등 관리 구역
-- ────────────────────────────────────────
CREATE TABLE sectors (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,        -- 예: '수도권', '영남권'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- 2. 사용자 프로필 (profiles)
--    Supabase Auth의 users와 1:1 연결
-- ────────────────────────────────────────
CREATE TABLE profiles (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  name       TEXT,                        -- 점검자 이름
  role       TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  sector_id  UUID REFERENCES sectors(id), -- 담당 섹터
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- 3. 충전소 (stations)
-- ────────────────────────────────────────
CREATE TABLE stations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sector_id       UUID NOT NULL REFERENCES sectors(id),
  name            TEXT NOT NULL,           -- 예: '장유휴게소-01'
  base_name       TEXT NOT NULL,           -- 예: '장유휴게소' (그룹핑 기준)
  address         TEXT,
  management_type TEXT,                    -- 관리구분
  voltage         NUMERIC,                 -- 수전전압 (V)
  capacity        NUMERIC,                 -- 수전용량 (kW)
  equipment_info  JSONB DEFAULT '{}',      -- 설비 정보 (유연한 추가 가능)
  custom_values   JSONB DEFAULT '{}',      -- 충전소별 고정값 (하드코딩 방지)
  is_active       BOOLEAN DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- base_name 자동 계산 함수 (장유휴게소-01 → 장유휴게소)
CREATE OR REPLACE FUNCTION extract_base_name(station_name TEXT)
RETURNS TEXT AS $$
BEGIN
  -- '-숫자' 패턴 제거 (예: -01, -02)
  IF station_name ~ '-\d+$' THEN
    RETURN regexp_replace(station_name, '-\d+$', '');
  END IF;
  RETURN station_name;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 충전소 삽입/수정 시 base_name 자동 설정 트리거
CREATE OR REPLACE FUNCTION set_station_base_name()
RETURNS TRIGGER AS $$
BEGIN
  NEW.base_name := extract_base_name(NEW.name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_station_base_name
BEFORE INSERT OR UPDATE ON stations
FOR EACH ROW EXECUTE FUNCTION set_station_base_name();

-- ────────────────────────────────────────
-- 4. 점검 이력 (inspections)
-- ────────────────────────────────────────
CREATE TABLE inspections (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL REFERENCES profiles(id),
  station_id      UUID NOT NULL REFERENCES stations(id),
  inspection_type TEXT NOT NULL CHECK (inspection_type IN ('월차', '분기', '반기', '연차')),
  inspection_date DATE NOT NULL,
  inspector_name  TEXT NOT NULL,           -- 점검자
  measure_values  JSONB DEFAULT '{}',      -- 전압, 전류 등 측정값
  remarks         TEXT,                    -- 특이사항
  file_path       TEXT,                    -- Storage 저장 경로
  file_name       TEXT,                    -- 생성된 파일명
  status          TEXT DEFAULT 'completed' CHECK (status IN ('draft', 'completed')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- 5. 시스템 설정 (settings)
--    관리자가 수정 가능한 전역 설정값
-- ────────────────────────────────────────
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,             -- 설정 키
  value      TEXT NOT NULL,               -- 설정 값
  label      TEXT,                        -- 화면 표시용 라벨
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기본 설정값 삽입
INSERT INTO settings (key, value, label) VALUES
  ('system_voltage', '22900', '계통전압 (V)'),
  ('company_name', '(주)회사명', '회사명'),
  ('manager_name', '홍길동', '전기안전관리자명');

-- ────────────────────────────────────────
-- 6. RLS (Row Level Security) 정책
-- ────────────────────────────────────────

-- RLS 활성화
ALTER TABLE profiles   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectors    ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings   ENABLE ROW LEVEL SECURITY;

-- ── profiles ──
-- 자신의 프로필만 조회/수정 가능
CREATE POLICY "profiles_self" ON profiles
  FOR ALL USING (auth.uid() = id);

-- 관리자는 전체 조회 가능
CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── sectors ──
-- 모든 인증 사용자 조회 가능 (섹터명은 공개)
CREATE POLICY "sectors_read" ON sectors
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 관리자만 수정 가능
CREATE POLICY "sectors_admin" ON sectors
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── stations ──
-- 자신의 섹터 충전소만 조회 가능
CREATE POLICY "stations_sector" ON stations
  FOR SELECT USING (
    sector_id = (SELECT sector_id FROM profiles WHERE id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- 관리자만 추가/수정/삭제 가능
CREATE POLICY "stations_admin" ON stations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "stations_admin_update" ON stations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "stations_admin_delete" ON stations
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── inspections ──
-- 자신이 생성한 점검이력만 조회/수정 가능
CREATE POLICY "inspections_self" ON inspections
  FOR ALL USING (user_id = auth.uid());

-- 같은 섹터 이력도 조회 가능 (팀 공유 목적)
CREATE POLICY "inspections_sector" ON inspections
  FOR SELECT USING (
    station_id IN (
      SELECT s.id FROM stations s
      JOIN profiles p ON p.sector_id = s.sector_id
      WHERE p.id = auth.uid()
    )
  );

-- 관리자는 전체 조회
CREATE POLICY "inspections_admin" ON inspections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── settings ──
-- 모든 인증 사용자 조회 가능
CREATE POLICY "settings_read" ON settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- 관리자만 수정
CREATE POLICY "settings_admin" ON settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ────────────────────────────────────────
-- 7. 신규 사용자 자동 프로필 생성 트리거
-- ────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    'user'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ────────────────────────────────────────
-- 8. 유용한 뷰 (View)
-- ────────────────────────────────────────

-- 충전소 그룹 뷰 (base_name 기준으로 합산)
CREATE OR REPLACE VIEW station_groups AS
SELECT
  sector_id,
  base_name,
  COUNT(*)          AS unit_count,          -- 하위 충전기 수
  SUM(capacity)     AS total_capacity,      -- 합산 수전용량
  MIN(voltage)      AS voltage,             -- 수전전압 (동일하다고 가정)
  array_agg(id)     AS station_ids,
  array_agg(name)   AS station_names
FROM stations
WHERE is_active = TRUE
GROUP BY sector_id, base_name;
