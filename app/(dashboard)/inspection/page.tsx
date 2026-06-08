'use client';
import { InspectionForm } from '@/components/inspection/InspectionForm';
export default function InspectionPage() {
  return (
    <div style={{ padding: '32px 36px 60px' }}>
      <div className="mb-7" style={{ maxWidth: 940 }}>
        <h1 className="text-2xl font-[800] tracking-tight">점검 생성</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          정보를 입력하면 직무고시 엑셀이 자동으로 생성 및 저장됩니다
        </p>
      </div>
      <InspectionForm />
    </div>
  );
}
