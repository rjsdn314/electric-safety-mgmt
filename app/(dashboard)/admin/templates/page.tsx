'use client';
// app/(dashboard)/admin/templates/page.tsx — 관리자: 충전소별 양식 등록
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import TemplateManager from '@/components/admin/TemplateManager';

export default function AdminTemplatesPage() {
  const { profile, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && profile && profile.role !== 'admin') router.replace('/dashboard');
  }, [loading, profile, router]);
  if (loading || !profile) return <div style={{ padding: 40, textAlign: 'center' }}>로딩 중…</div>;
  if (profile.role !== 'admin') return null;
  return <div style={{ paddingTop: 24 }}><TemplateManager /></div>;
}
