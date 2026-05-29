-- ============================================================
-- 전기안전관리 자동화 웹앱 — Supabase DB 설계 v2
-- 회원가입 승인 + 계정별 관리구역 + 엑셀 업로드 기능 추가
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ────────────────────────────────────────
-- 1. 섹터 (sectors) — 관리구역 그룹
-- ────────────────────────────────────────
CREATE TABLE sectors (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- 2. 사용자 프로필 (profiles)
-- ────────────────────────────────────────
CREATE TABLE profiles (
  id             UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email          TEXT NOT NULL,
  name           TEXT,
  inspector_name TEXT,                     -- 점검자 기본값
  role           TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending', 'approved', 'rejected')),
  sector_id      UUID REFERENCES sectors(id),
  approved_at    TIMESTAMPTZ,
  approved_by    UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- 3. 충전소 (stations)
-- ────────────────────────────────────────
CREATE TABLE stations (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  sector_id        UUID NOT NULL REFERENCES sectors(id),
  user_id          UUID REFERENCES profiles(id), -- 등록한 사용자 (NULL이면 관리자 등록)
  name             TEXT NOT NULL,
  base_name        TEXT NOT NULL,
  address          TEXT,
  management_type  TEXT,
  voltage          NUMERIC,
  capacity         NUMERIC,
  panel_count      INTEGER DEFAULT 1,      -- 수배전반 개수
  panel_names      TEXT[],                 -- 수배전반 이름 배열 (예: ['수배전반1','수배전반2'])
  default_type     TEXT DEFAULT '월차',   -- 기본 점검표 양식
  equipment_info   JSONB DEFAULT '{}',
  custom_values    JSONB DEFAULT '{}',
  is_active        BOOLEAN DEFAULT TRUE,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION extract_base_name(station_name TEXT)
RETURNS TEXT AS $$
BEGIN
  IF station_name ~ '-\d+$' THEN
    RETURN regexp_replace(station_name, '-\d+$', '');
  END IF;
  RETURN station_name;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

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
  inspection_type TEXT NOT NULL CHECK (inspection_type IN ('월차','분기','반기','연차')),
  inspection_date DATE NOT NULL,
  inspector_name  TEXT NOT NULL,
  measure_values  JSONB DEFAULT '{}',
  remarks         TEXT,
  file_path       TEXT,
  file_name       TEXT,
  status          TEXT DEFAULT 'completed' CHECK (status IN ('draft','completed')),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- 5. 회원가입 신청 (signup_requests)
-- ────────────────────────────────────────
CREATE TABLE signup_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  name         TEXT NOT NULL,
  company      TEXT,                       -- 소속 회사
  phone        TEXT,                       -- 연락처
  message      TEXT,                       -- 신청 사유
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  admin_note   TEXT,                       -- 관리자 메모
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- 6. 엑셀 업로드 이력 (station_uploads)
-- ────────────────────────────────────────
CREATE TABLE station_uploads (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES profiles(id),
  file_name   TEXT NOT NULL,
  row_count   INTEGER DEFAULT 0,
  status      TEXT DEFAULT 'completed',
  error_log   TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ────────────────────────────────────────
-- 7. 시스템 설정 (settings)
-- ────────────────────────────────────────
CREATE TABLE settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  label      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO settings (key, value, label) VALUES
  ('system_voltage', '22900',   '계통전압 (V)'),
  ('company_name',   '(주)회사명', '회사명'),
  ('manager_name',   '황건우',   '전기안전관리자명'),
  ('admin_email',    'rjsdn43666211@gmail.com', '관리자 이메일');

-- ────────────────────────────────────────
-- 8. RLS 정책
-- ────────────────────────────────────────
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE sectors         ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inspections     ENABLE ROW LEVEL SECURITY;
ALTER TABLE signup_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings        ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_self" ON profiles
  FOR ALL USING (auth.uid() = id);
CREATE POLICY "profiles_admin_all" ON profiles
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- sectors (공개 조회)
CREATE POLICY "sectors_read" ON sectors
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "sectors_admin" ON sectors
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- stations: 승인된 사용자가 자신의 sector 또는 자신이 등록한 것만 조회
CREATE POLICY "stations_select" ON stations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.status = 'approved'
        AND (
          p.role = 'admin'
          OR p.sector_id = stations.sector_id
          OR stations.user_id = auth.uid()
        )
    )
  );
CREATE POLICY "stations_insert" ON stations
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND status = 'approved')
  );
CREATE POLICY "stations_update" ON stations
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
CREATE POLICY "stations_delete" ON stations
  FOR DELETE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- inspections
CREATE POLICY "inspections_self" ON inspections
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "inspections_admin" ON inspections
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- signup_requests
CREATE POLICY "signup_self" ON signup_requests
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "signup_admin" ON signup_requests
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- station_uploads
CREATE POLICY "uploads_self" ON station_uploads
  FOR ALL USING (user_id = auth.uid());
CREATE POLICY "uploads_admin" ON station_uploads
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- settings
CREATE POLICY "settings_read" ON settings
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "settings_admin" ON settings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ────────────────────────────────────────
-- 9. 신규 사용자 프로필 자동 생성 트리거
-- ────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    'user',
    'pending'    -- 기본값: 승인 대기
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ────────────────────────────────────────
-- 10. 유용한 뷰 (View)
-- ────────────────────────────────────────
CREATE OR REPLACE VIEW station_groups AS
SELECT
  sector_id,
  user_id,
  base_name,
  COUNT(*)        AS unit_count,
  SUM(capacity)   AS total_capacity,
  MIN(voltage)    AS voltage,
  MAX(panel_count) AS max_panels,
  array_agg(id)   AS station_ids,
  array_agg(name) AS station_names
FROM stations
WHERE is_active = TRUE
GROUP BY sector_id, user_id, base_name;

-- 관리자용 사용자 목록 뷰
CREATE OR REPLACE VIEW admin_users_view AS
SELECT
  p.id, p.email, p.name, p.role, p.status,
  p.created_at, p.approved_at,
  s.name AS sector_name,
  COUNT(DISTINCT st.id)  AS station_count,
  COUNT(DISTINCT ins.id) AS inspection_count
FROM profiles p
LEFT JOIN sectors      s   ON s.id = p.sector_id
LEFT JOIN stations     st  ON st.user_id = p.id
LEFT JOIN inspections  ins ON ins.user_id = p.id
GROUP BY p.id, p.email, p.name, p.role, p.status,
         p.created_at, p.approved_at, s.name;
