'use client';
// app/(dashboard)/admin/templates/page.tsx — 관리자: 충전소별 양식 등록
import { useAuth } from '@/hooks/useAuth';
import TemplateManager from '@/components/admin/TemplateManager';

export default function AdminTemplatesPage() {
  const { profile, loading } = useAuth();
  // 양식 등록은 승인된 사용자 누구나 가능(본인 충전소 한정 — 목록/스토리지에서 스코핑).
  if (loading || !profile) return <div style={{ padding: 40, textAlign: 'center' }}>로딩 중…</div>;
  return <TemplateManager />;
}
