'use client';
// app/(dashboard)/admin/templates/page.tsx — 양식 엑셀 올리기는 관리구역 화면의 탭으로 옮김 (예전 주소 호환)
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminTemplatesPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/stations/upload?tab=forms'); }, [router]);
  return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>관리구역으로 이동하는 중</div>;
}
