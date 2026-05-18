'use client';
// ============================================================
// app/admin/layout.tsx — 관리자 레이아웃 (권한 체크)
// ============================================================
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Sidebar } from '@/components/layout/Sidebar';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && profile?.role !== 'admin') {
      router.replace('/dashboard');
    }
  }, [profile, loading, router]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
        <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>권한 확인 중...</div>
      </div>
    );
  }

  if (profile?.role !== 'admin') return null;

  return (
    <div className="flex min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      <Sidebar />
      <div className="flex-1 md:ml-[220px] pb-[60px] md:pb-0">
        {children}
      </div>
    </div>
  );
}
