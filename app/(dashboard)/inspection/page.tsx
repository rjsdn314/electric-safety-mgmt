'use client';
import { InspectionForm } from '@/components/inspection/InspectionForm';
export default function InspectionPage() {
  return (
    <div className="page-pad" style={{ padding: '28px 32px 60px' }}>
      <div style={{ maxWidth: 940, marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 4px' }}>점검 생성</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
          측정값을 넣으면 직무고시 점검표 엑셀을 만들어 저장합니다.
        </p>
      </div>
      <InspectionForm />
    </div>
  );
}
