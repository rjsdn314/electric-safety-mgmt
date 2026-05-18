# 전기안전관리 직무고시 자동화 웹앱 — 전체 구조 설계

## 프로젝트 개요

| 항목 | 내용 |
|------|------|
| 목적 | 전기차 충전소 전기안전관리 직무고시 문서 자동 생성 |
| 사용자 | 비개발자 전기안전관리자 |
| 배포 | Vercel + Supabase |
| 핵심 가치 | 유지보수 용이 · 토큰 효율 · 비개발자 관리 가능 |

---

## 1. 기술 스택

| 레이어 | 기술 |
|--------|------|
| Frontend | Next.js 15 (App Router) + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| Backend/DB | Supabase (PostgreSQL + RLS) |
| Auth | Supabase Auth (이메일/비밀번호) |
| Storage | Supabase Storage |
| Excel | ExcelJS |
| 배포 | Vercel |

---

## 2. 전체 아키텍처

```
[사용자 브라우저]
     │
     ▼
[Next.js App (Vercel)]
  ├─ /app              ← 페이지 라우팅
  ├─ /components       ← UI 컴포넌트
  ├─ /lib              ← 비즈니스 로직
  │   ├─ /excel        ← ExcelJS 엑셀 생성
  │   ├─ /supabase     ← DB/Auth/Storage
  │   └─ /utils        ← 공통 유틸
  ├─ /config           ← 점검유형별 JSON 설정
  ├─ /types            ← TypeScript 타입
  └─ /hooks            ← 커스텀 React 훅
     │
     ▼
[Supabase]
  ├─ Auth              ← 사용자 인증
  ├─ Database          ← 충전소/점검이력/설정
  ├─ Storage           ← 생성된 엑셀 파일
  └─ RLS               ← 계정별 데이터 분리
```

---

## 3. 핵심 설계 원칙

### 3-1. Config 기반 구조 (토큰 절약 핵심)
```
config/
  monthly.json      ← 월차점검 시트 규칙
  quarterly.json    ← 분기점검 시트 규칙
  yearly.json       ← 연차점검 시트 규칙
  sheet-fields.json ← 시트별 입력 필드 매핑
```
→ 점검 유형이 바뀌어도 JSON만 수정하면 됨. 코드 변경 불필요.

### 3-2. 레이어 분리
| 레이어 | 역할 |
|--------|------|
| UI 컴포넌트 | 화면 출력만 담당 |
| hooks | 상태/데이터 관리 |
| lib/excel | 엑셀 생성 로직만 담당 |
| lib/supabase | DB 쿼리만 담당 |
| config/*.json | 점검 규칙 데이터 |

### 3-3. 충전소명 통합 로직
- `장유휴게소-01`, `장유휴게소-02` → 기준명 `장유휴게소`로 그룹핑
- 수전용량 자동 합산
- 파일명은 기준명 사용

---

## 4. 점검 유형별 시트 규칙

| 점검유형 | 진행 월 | 자동 작성 시트 |
|----------|---------|---------------|
| 월차 | 1,2,4,5,7,8,12월 | 별지1, 별지14 |
| 분기/반기 | 3,9월 | 별지1,2,7,14 |
| 연차 | 11월 | 모든 별지 |

---

## 5. 파일명 규칙

```
{충전소명}_{점검유형}점검_{YYYY-MM-DD}.xlsx
예: 장유휴게소_월차점검_2026-05-12.xlsx
```

---

## 6. Storage 구조

```
/users/{user_id}/inspections/{year}/{month}/{파일명}.xlsx
```

---

## 7. RLS 보안 정책

- 사용자는 자신의 `sector_id`에 속한 충전소만 조회 가능
- 자신이 생성한 파일만 Storage 접근 가능
- 관리자(role=admin)는 전체 조회 가능

---

## 8. 개발 진행 단계

| 단계 | 내용 |
|------|------|
| 1단계 | 전체 구조 설계 ← 현재 |
| 2단계 | 폴더 구조 설계 |
| 3단계 | Supabase DB 설계 |
| 4단계 | ExcelJS 구조 설계 |
| 5단계 | 점검 생성 로직 설계 |
| 6단계 | UI 설계 |
| 7단계 | 관리자 기능 설계 |
| 8단계 | Vercel 배포 구조 설계 |
