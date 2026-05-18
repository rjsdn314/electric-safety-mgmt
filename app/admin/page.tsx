'use client';
// ============================================================
// app/admin/page.tsx — 관리자 대시보드
// ============================================================
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface AdminStats {
  totalUsers: number;
  totalStations: number;
  totalInspections: number;
  thisMonthInspections: number;
}

function StatCard({ label, value, icon, href }: {
  label: string; value: number; icon: string; href?: string;
}) {
  const inner = (
    <div className="rounded-[16px] p-5 transition-all hover:-translate-y-px group"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      onMouseEnter={e => (e.currentTarget.style.borderColor = '#3182F6')}
      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
      <div className="flex items-center justify-between mb-3">
        <span className="text-xl">{icon}</span>
        {href && <span className="text-xs opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--accent)' }}>관리 →</span>}
      </div>
      <div className="text-[28px] font-[800] tracking-tight">{value}</div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function AdminPage() {
  const [stats, setStats] = useState<AdminStats>({ totalUsers: 0, totalStations: 0, totalInspections: 0, thisMonthInspections: 0 });
  const supabase = createClient();

  useEffect(() => {
    const fetchStats = async () => {
      const now = new Date();
      const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      const [users, stations, inspections, thisMonth] = await Promise.all([
        supabase.from('profiles').select('id', { count: 'exact', head: true }),
        supabase.from('stations').select('id', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('inspections').select('id', { count: 'exact', head: true }),
        supabase.from('inspections').select('id', { count: 'exact', head: true }).gte('inspection_date', monthStart),
      ]);

      setStats({
        totalUsers: users.count ?? 0,
        totalStations: stations.count ?? 0,
        totalInspections: inspections.count ?? 0,
        thisMonthInspections: thisMonth.count ?? 0,
      });
    };
    fetchStats();
  }, []);

  const menus = [
    { href: '/admin/users',    icon: '👥', title: '사용자 관리',   desc: '계정 생성 · 섹터 배정 · 권한 설정' },
    { href: '/admin/stations', icon: '🏗️', title: '충전소 관리',   desc: '충전소 추가 · 수정 · 삭제 · 설비정보' },
    { href: '/admin/settings', icon: '⚙️', title: '시스템 설정',   desc: '계통전압 · 회사명 · 전역 기본값' },
    { href: '/admin/history',  icon: '📊', title: '전체 이력 조회', desc: '모든 섹터 점검이력 조회 · 다운로드' },
  ];

  return (
    <div className="p-8 max-w-[1100px]">
      <div className="mb-7">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3"
          style={{ background: 'rgba(240,68,82,.12)', color: '#F04452' }}>
          🛡️ 관리자 전용
        </div>
        <h1 className="text-2xl font-[800] tracking-tight">관리자 대시보드</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>시스템 전체 현황 및 관리 기능</p>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="전체 사용자" value={stats.totalUsers}          icon="👥" href="/admin/users" />
        <StatCard label="전체 충전소" value={stats.totalStations}       icon="🏗️" href="/admin/stations" />
        <StatCard label="전체 점검이력" value={stats.totalInspections}  icon="📋" />
        <StatCard label="이번달 점검" value={stats.thisMonthInspections} icon="📅" />
      </div>

      {/* 메뉴 그리드 */}
      <div className="grid md:grid-cols-2 gap-4">
        {menus.map(m => (
          <Link key={m.href} href={m.href}>
            <div className="p-6 rounded-[20px] transition-all hover:-translate-y-px cursor-pointer"
              style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#3182F6')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div className="text-2xl mb-3">{m.icon}</div>
              <div className="text-base font-bold mb-1">{m.title}</div>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>{m.desc}</div>
              <div className="mt-4 text-xs font-semibold" style={{ color: 'var(--accent)' }}>관리하기 →</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
