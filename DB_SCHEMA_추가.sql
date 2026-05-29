-- ============================================================
-- DB_SCHEMA_추가.sql — v2 업그레이드용 추가 SQL
-- 기존 DB에 새 컬럼/테이블 추가 시 이 파일을 실행하세요
-- Supabase SQL Editor에서 순서대로 실행
-- ============================================================

-- ── 1. profiles 테이블에 새 컬럼 추가 ──
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS inspector_name TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS approved_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by    UUID REFERENCES auth.users(id);

-- 관리자는 자동 승인 처리
UPDATE profiles SET status = 'approved' WHERE role = 'admin';

-- ── 2. stations 테이블에 새 컬럼 추가 ──
ALTER TABLE stations
  ADD COLUMN IF NOT EXISTS user_id      UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS panel_count  INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS panel_names  TEXT[],
  ADD COLUMN IF NOT EXISTS default_type TEXT DEFAULT '월차';

-- ── 3. signup_requests 테이블 생성 ──
CREATE TABLE IF NOT EXISTS signup_requests (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  name         TEXT NOT NULL,
  company      TEXT,
  phone        TEXT,
  message      TEXT,
  status       TEXT NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','approved','rejected')),
  admin_note   TEXT,
  processed_at TIMESTAMPTZ,
  processed_by UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE signup_requests ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "signup_self" ON signup_requests
    FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE POLICY "signup_admin" ON signup_requests
    FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ── 4. station_uploads 테이블 생성 ──
CREATE TABLE IF NOT EXISTS station_uploads (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID NOT NULL REFERENCES profiles(id),
  file_name  TEXT NOT NULL,
  row_count  INTEGER DEFAULT 0,
  status     TEXT DEFAULT 'completed',
  error_log  TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE station_uploads ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "uploads_self" ON station_uploads
    FOR ALL USING (user_id = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

DO $$ BEGIN
  CREATE POLICY "uploads_admin" ON station_uploads
    FOR ALL USING (
      EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END; $$;

-- ── 5. settings에 admin_email 추가 ──
INSERT INTO settings (key, value, label)
VALUES ('admin_email', 'rjsdn43666211@gmail.com', '관리자 이메일')
ON CONFLICT (key) DO NOTHING;

-- ── 6. stations RLS 정책 업데이트 ──
DROP POLICY IF EXISTS "stations_sector" ON stations;
DROP POLICY IF EXISTS "stations_admin"  ON stations;
DROP POLICY IF EXISTS "stations_admin_update" ON stations;
DROP POLICY IF EXISTS "stations_admin_delete" ON stations;
DROP POLICY IF EXISTS "stations_select" ON stations;
DROP POLICY IF EXISTS "stations_insert" ON stations;
DROP POLICY IF EXISTS "stations_update" ON stations;
DROP POLICY IF EXISTS "stations_delete" ON stations;

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

-- ── 7. 신규 사용자 트리거 수정 (status 포함) ──
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', ''),
    'user',
    'pending'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 8. 관리자(황건우) 계정을 admin + approved 로 설정 ──
UPDATE profiles
SET role = 'admin', status = 'approved'
WHERE email = 'rjsdn43666211@gmail.com';

-- ── 완료 확인 ──
SELECT
  '✅ DB v2 업그레이드 완료' AS result,
  (SELECT count(*) FROM signup_requests) AS signup_requests_count,
  (SELECT count(*) FROM station_uploads) AS station_uploads_count;
