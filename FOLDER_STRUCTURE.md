# 2단계: 폴더 구조 설계

## 전체 폴더 트리

```
전기안전관리-webapp/
│
├── .env.local                  # 환경변수 (Supabase URL, Key 등)
├── .env.example                # 환경변수 예시 파일
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
├── README.md
│
├── public/
│   └── templates/              # 엑셀 기본 양식 파일 (.xlsx)
│       └── base-template.xlsx
│
├── config/                     # ★ 점검유형별 규칙 (JSON) - 비개발자 수정 가능
│   ├── monthly.json            # 월차점검 시트 규칙
│   ├── quarterly.json          # 분기/반기점검 시트 규칙
│   ├── yearly.json             # 연차점검 시트 규칙
│   └── sheet-fields.json       # 시트별 셀 매핑 정의
│
├── types/                      # TypeScript 타입 정의
│   ├── inspection.ts           # 점검 관련 타입
│   ├── station.ts              # 충전소 관련 타입
│   ├── user.ts                 # 사용자/섹터 타입
│   └── excel.ts                # 엑셀 생성 관련 타입
│
├── lib/                        # 비즈니스 로직 (UI 없음)
│   ├── supabase/
│   │   ├── client.ts           # 브라우저용 Supabase 클라이언트
│   │   ├── server.ts           # 서버용 Supabase 클라이언트
│   │   ├── stations.ts         # 충전소 DB 쿼리
│   │   ├── inspections.ts      # 점검이력 DB 쿼리
│   │   └── users.ts            # 사용자/섹터 DB 쿼리
│   │
│   ├── excel/
│   │   ├── builder.ts          # 엑셀 생성 진입점 (조립기)
│   │   ├── sheets/
│   │   │   ├── byeolji1.ts     # 별지1 작성 로직
│   │   │   ├── byeolji2.ts     # 별지2 작성 로직
│   │   │   ├── byeolji7.ts     # 별지7 작성 로직
│   │   │   └── byeolji14.ts    # 별지14 작성 로직
│   │   └── utils.ts            # 셀 스타일, 병합 유틸
│   │
│   └── utils/
│       ├── station-group.ts    # 충전소명 통합 로직 (장유-01, 장유-02 → 장유)
│       ├── filename.ts         # 파일명 생성 규칙
│       └── inspection-type.ts  # 월→점검유형 판별 로직
│
├── hooks/                      # React 커스텀 훅
│   ├── useStations.ts          # 충전소 목록 조회
│   ├── useInspections.ts       # 점검이력 조회
│   └── useAuth.ts              # 인증 상태 관리
│
├── components/                 # UI 컴포넌트 (표시만 담당)
│   ├── ui/                     # shadcn/ui 기본 컴포넌트 (자동생성)
│   ├── auth/
│   │   └── LoginForm.tsx       # 로그인 폼
│   ├── inspection/
│   │   ├── InspectionForm.tsx  # 점검 입력 폼 (메인)
│   │   ├── StationSelect.tsx   # 충전소 검색/선택 드롭다운
│   │   ├── TypeSelect.tsx      # 점검유형 선택
│   │   └── MeasureInputs.tsx   # 측정값 입력 (전압/전류 등)
│   ├── history/
│   │   └── InspectionHistory.tsx  # 점검이력 목록
│   └── admin/
│       ├── StationManager.tsx  # 충전소 추가/수정/삭제
│       ├── UserManager.tsx     # 사용자 관리
│       └── SectorManager.tsx   # 섹터 배정
│
└── app/                        # Next.js App Router 페이지
    ├── layout.tsx              # 루트 레이아웃
    ├── page.tsx                # 루트 → /login 리다이렉트
    ├── (auth)/
    │   └── login/
    │       └── page.tsx        # 로그인 페이지
    ├── (dashboard)/
    │   ├── layout.tsx          # 대시보드 공통 레이아웃 (사이드바)
    │   ├── dashboard/
    │   │   └── page.tsx        # 메인 대시보드
    │   ├── inspection/
    │   │   └── page.tsx        # 점검 생성 페이지
    │   └── history/
    │       └── page.tsx        # 점검 이력 페이지
    └── admin/
        ├── layout.tsx          # 관리자 레이아웃
        ├── page.tsx            # 관리자 대시보드
        ├── stations/
        │   └── page.tsx        # 충전소 관리
        └── users/
            └── page.tsx        # 사용자 관리
```

---

## 핵심 파일 역할 요약

| 파일/폴더 | 역할 | 수정 난이도 |
|-----------|------|------------|
| `config/*.json` | 점검규칙 설정 | ★ 쉬움 (JSON 편집) |
| `lib/excel/sheets/` | 시트별 입력 로직 | ★★ 보통 |
| `lib/supabase/` | DB 쿼리 | ★★ 보통 |
| `components/` | 화면 컴포넌트 | ★★ 보통 |
| `types/` | 타입 정의 | ★★ 보통 |

---

## 파일 추가/수정 가이드 (비개발자용)

### 새로운 충전소 추가
→ Supabase 대시보드 또는 관리자 페이지에서 추가

### 점검 시트 규칙 변경
→ `config/monthly.json` 등 JSON 파일만 수정

### 새 시트 추가
→ `lib/excel/sheets/새시트.ts` 파일 생성 후 `builder.ts`에 등록
