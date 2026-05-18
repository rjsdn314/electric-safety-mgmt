# 전기안전관리 직무고시 자동화 웹앱

## 개요
전기차 충전소 전기안전관리 직무고시 문서를 자동 생성하는 웹앱입니다.

## 기술 스택
- **Frontend**: Next.js 15 + TypeScript + Tailwind CSS + shadcn/ui
- **Backend**: Supabase (DB + Auth + Storage)
- **Excel**: ExcelJS
- **배포**: Vercel

---

## 설치 방법

### 1. 저장소 클론
```bash
git clone https://github.com/your-repo/electric-safety-management.git
cd electric-safety-management
```

### 2. 패키지 설치
```bash
npm install
```

### 3. 환경변수 설정
```bash
cp .env.example .env.local
# .env.local 파일을 열어 Supabase URL과 Key 입력
```

### 4. Supabase DB 초기화
- Supabase 대시보드 → SQL Editor
- `DB_SCHEMA.sql` 파일 전체 복사 후 실행

### 5. shadcn/ui 컴포넌트 설치
```bash
npx shadcn@latest init
npx shadcn@latest add button input select card table
```

---

## 실행 방법

```bash
# 개발 서버 실행
npm run dev
# → http://localhost:3000 접속
```

---

## 배포 방법 (Vercel)

1. GitHub에 코드 푸시
2. Vercel 대시보드에서 저장소 연결
3. Environment Variables에 `.env.example` 항목 입력
4. Deploy 버튼 클릭

---

## 폴더 구조 설명

| 폴더 | 역할 |
|------|------|
| `/config` | 점검유형별 규칙 (JSON) — 비개발자 수정 가능 |
| `/types` | TypeScript 타입 정의 |
| `/lib/excel` | 엑셀 생성 로직 |
| `/lib/supabase` | DB 쿼리 함수 |
| `/lib/utils` | 공통 유틸 함수 |
| `/hooks` | React 커스텀 훅 |
| `/components` | UI 컴포넌트 |
| `/app` | Next.js 페이지 |

---

## 자주 하는 작업

### 점검 시트 규칙 변경
`config/monthly.json`, `config/quarterly.json`, `config/yearly.json` 수정

### 새 충전소 추가
관리자 페이지 → 충전소 관리 → 추가

### 특정 셀 위치 변경
`lib/excel/sheets/byeolji1.ts` 등 해당 시트 파일에서 셀 주소 수정

---

## 계정 권한

| 역할 | 권한 |
|------|------|
| `admin` | 전체 조회/수정, 사용자 관리, 충전소 관리 |
| `user` | 자신 섹터 충전소 조회, 점검 생성/조회 |
