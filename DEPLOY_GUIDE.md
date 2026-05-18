# 8단계: Vercel 배포 가이드

## 전체 배포 흐름

```
로컬 개발
  └─▶ GitHub 푸시
        └─▶ Vercel 자동 빌드
              └─▶ 프로덕션 배포 (HTTPS)
```

---

## Step 1. Supabase 초기 설정

### 1-1. 프로젝트 생성
1. https://supabase.com → New Project
2. 이름: `electric-safety-mgmt`
3. 비밀번호 저장 (DB 비밀번호)
4. 지역: **Northeast Asia (Seoul)** 선택

### 1-2. DB 스키마 적용
```
Supabase 대시보드 → SQL Editor → New Query
→ DB_SCHEMA.sql 전체 붙여넣기 → Run
```

### 1-3. Storage 버킷 생성
```
Supabase 대시보드 → Storage → New Bucket
이름: inspections
Public: ❌ (비공개)
```

Storage 정책 SQL:
```sql
-- 사용자 본인 파일만 업로드/다운로드
CREATE POLICY "storage_self"
ON storage.objects FOR ALL
USING (bucket_id = 'inspections' AND auth.uid()::text = (storage.foldername(name))[2]);

-- 관리자 전체 접근
CREATE POLICY "storage_admin"
ON storage.objects FOR ALL
USING (
  bucket_id = 'inspections'
  AND EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  )
);
```

### 1-4. API 키 확인
```
Settings → API
  NEXT_PUBLIC_SUPABASE_URL     → Project URL
  NEXT_PUBLIC_SUPABASE_ANON_KEY → anon public
  SUPABASE_SERVICE_ROLE_KEY    → service_role (절대 공개 금지)
```

### 1-5. Auth 설정
```
Authentication → URL Configuration
  Site URL: https://your-app.vercel.app
  Redirect URLs: https://your-app.vercel.app/**
```

---

## Step 2. GitHub 저장소 생성

```bash
# 프로젝트 루트에서
git init
git add .
git commit -m "feat: 전기안전관리 자동화 초기 설정"
git remote add origin https://github.com/YOUR_ID/electric-safety-mgmt.git
git push -u origin main
```

`.gitignore` 필수 항목:
```
.env.local
.env*.local
node_modules/
.next/
```

---

## Step 3. Vercel 배포

### 3-1. Vercel 프로젝트 생성
1. https://vercel.com → Add New Project
2. GitHub 저장소 연결
3. Framework: **Next.js** (자동 감지)

### 3-2. 환경변수 입력
```
Settings → Environment Variables

NEXT_PUBLIC_SUPABASE_URL       = https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY  = eyJhbGci...
SUPABASE_SERVICE_ROLE_KEY      = eyJhbGci...
NEXT_PUBLIC_APP_URL            = https://your-app.vercel.app
```

> ⚠️ `SUPABASE_SERVICE_ROLE_KEY`는 반드시
> `NEXT_PUBLIC_` 접두사 없이 설정 (서버 전용)

### 3-3. 배포
```
Vercel 대시보드 → Deploy
```

이후 GitHub main 브랜치에 push하면 자동 재배포됩니다.

---

## Step 4. 최초 관리자 계정 생성

```sql
-- Supabase SQL Editor에서 실행
-- (원하는 계정의 user id로 변경)
UPDATE profiles
SET role = 'admin'
WHERE email = 'admin@yourcompany.com';
```

또는 Supabase 대시보드 → Authentication → Users에서
이메일로 사용자 초대 후 위 SQL 실행

---

## Step 5. 엑셀 템플릿 업로드

기존 양식 엑셀 파일을 아래 경로에 배치:
```
public/
  templates/
    base-template.xlsx    ← 기존 직무고시 양식 파일
```

Vercel에서는 `public/` 폴더가 정적 파일로 자동 서빙됩니다.

---

## 배포 후 체크리스트

### 기능 확인
- [ ] 로그인 동작 확인
- [ ] 로그인 후 대시보드 정상 표시
- [ ] 충전소 목록 로딩 확인
- [ ] 점검 생성 → 엑셀 다운로드 확인
- [ ] Storage에 파일 업로드 확인
- [ ] 점검이력 표시 확인
- [ ] 관리자 계정으로 /admin 접근 확인
- [ ] 일반 계정으로 /admin 접근 시 리다이렉트 확인
- [ ] 다른 섹터 데이터 격리 확인 (RLS)

### 보안 확인
- [ ] `.env.local`이 GitHub에 올라가지 않았는지 확인
- [ ] Supabase RLS 활성화 상태 확인
- [ ] `SUPABASE_SERVICE_ROLE_KEY` 가 `NEXT_PUBLIC_` 없이 설정됐는지 확인

---

## 로컬 개발 → 배포 반복 워크플로우

```bash
# 1. 코드 수정
# 2. 로컬 테스트
npm run dev

# 3. 타입 체크
npm run typecheck

# 4. GitHub 푸시 → Vercel 자동 배포
git add . && git commit -m "fix: ..." && git push
```

---

## 문제 해결

| 증상 | 원인 | 해결 |
|------|------|------|
| 로그인 후 리다이렉트 안됨 | Supabase Redirect URL 미설정 | Auth → URL Configuration 확인 |
| 엑셀 생성 오류 | 템플릿 파일 없음 | `public/templates/base-template.xlsx` 배치 |
| 파일 다운로드 안됨 | Storage 정책 오류 | Storage RLS 정책 재적용 |
| 다른 계정 데이터 보임 | RLS 미적용 | DB_SCHEMA.sql의 RLS 정책 확인 |
| `/admin` 접근 가능 | role 미설정 | profiles 테이블에서 role = 'admin' 설정 |

---

## 프로젝트 최종 구조 요약

```
전기안전관리-webapp/
├── app/
│   ├── (auth)/login/page.tsx         ← 로그인
│   ├── (dashboard)/
│   │   ├── layout.tsx                ← 사이드바 레이아웃
│   │   ├── dashboard/page.tsx        ← 대시보드
│   │   ├── inspection/page.tsx       ← 점검 생성
│   │   └── history/page.tsx          ← 점검 이력
│   ├── admin/
│   │   ├── layout.tsx                ← 관리자 권한 체크
│   │   ├── page.tsx                  ← 관리자 대시보드
│   │   ├── users/page.tsx            ← 사용자 관리
│   │   ├── stations/page.tsx         ← 충전소 관리
│   │   ├── settings/page.tsx         ← 시스템 설정
│   │   └── history/page.tsx          ← 전체 이력 조회
│   └── api/
│       ├── inspection/create/route.ts ← 엑셀 생성 API
│       └── admin/invite-user/route.ts ← 사용자 초대 API
├── components/
│   ├── layout/Sidebar.tsx
│   └── inspection/{Form, StationSelect, TypeSelect, MeasureInputs}
├── lib/
│   ├── supabase/{client, server}
│   ├── excel/{builder, sheets/byeolji*.ts, utils}
│   └── utils/{filename, inspection-type, station-group}
├── config/{monthly, quarterly, yearly}.json
├── types/index.ts
├── hooks/{useAuth, useStations, useInspections}
├── middleware.ts                      ← 라우트 보호
├── DB_SCHEMA.sql                      ← Supabase 초기화
├── .env.example
├── next.config.ts
├── tailwind.config.ts
└── README.md
```
