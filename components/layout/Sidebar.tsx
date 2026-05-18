'use client';
// ============================================================
// components/layout/Sidebar.tsx
// ============================================================
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';

const NAV = [
  { href: '/dashboard',  icon: '🏠', label: '대시보드' },
  { href: '/inspection', icon: '📋', label: '점검 생성', badge: 'NEW' },
  { href: '/history',    icon: '📁', label: '점검 이력' },
];

const ADMIN_NAV = [
  { href: '/admin/stations', icon: '🏗️', label: '충전소 관리' },
  { href: '/admin/users',    icon: '👥', label: '사용자 관리' },
  { href: '/admin',          icon: '⚙️', label: '설정' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { profile } = useAuth();

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {/* ── PC 사이드바 ── */}
      <aside className="hidden md:flex flex-col fixed top-0 left-0 bottom-0 w-[220px] border-r"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border)' }}>

        {/* 로고 */}
        <div className="flex items-center gap-2.5 px-5 py-7">
          <div className="w-8 h-8 rounded-[10px] flex items-center justify-center text-base font-bold"
            style={{ background: 'var(--accent)' }}>⚡</div>
          <span className="text-[15px] font-bold">전기안전관리</span>
        </div>

        {/* 메인 메뉴 */}
        <nav className="px-3 flex-1">
          <div className="nav-label mb-2">메뉴</div>
          {NAV.map(item => (
            <Link key={item.href} href={item.href}>
              <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-sm font-medium mb-0.5 transition-all cursor-pointer
                ${isActive(item.href)
                  ? 'text-[#3182F6]'
                  : 'text-[#8E8E93] hover:text-white hover:bg-[#1C1C1E]'
                }`}
                style={isActive(item.href) ? { background: 'var(--accent-soft)' } : {}}>
                <span className="text-[17px] w-[22px] text-center">{item.icon}</span>
                <span>{item.label}</span>
                {item.badge && (
                  <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white"
                    style={{ background: 'var(--accent)' }}>{item.badge}</span>
                )}
              </div>
            </Link>
          ))}

          {/* 관리자 메뉴 */}
          {profile?.role === 'admin' && (
            <>
              <div className="nav-label mt-4 mb-2">관리자</div>
              {ADMIN_NAV.map(item => (
                <Link key={item.href} href={item.href}>
                  <div className={`flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] text-sm font-medium mb-0.5 transition-all cursor-pointer
                    ${isActive(item.href)
                      ? 'text-[#3182F6]'
                      : 'text-[#8E8E93] hover:text-white hover:bg-[#1C1C1E]'
                    }`}
                    style={isActive(item.href) ? { background: 'var(--accent-soft)' } : {}}>
                    <span className="text-[17px] w-[22px] text-center">{item.icon}</span>
                    <span>{item.label}</span>
                  </div>
                </Link>
              ))}
            </>
          )}
        </nav>

        {/* 사용자 카드 */}
        <div className="px-3 pt-4 pb-5 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-[10px] cursor-pointer hover:bg-[#1C1C1E] transition-colors">
            <div className="w-[34px] h-[34px] rounded-full flex items-center justify-center text-[13px] font-bold flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #3182F6, #6C5CE7)' }}>
              {profile?.name?.[0] ?? '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold truncate">{profile?.name ?? '사용자'}</div>
              <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>{profile?.sector?.name ?? ''} 담당자</div>
            </div>
          </div>
        </div>
      </aside>

      {/* ── 모바일 하단 탭바 ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex h-[60px]"
        style={{ background: 'var(--bg-surface)', borderTop: '1px solid var(--border)' }}>
        {[...NAV, { href: '/settings', icon: '⚙️', label: '설정' }].map(item => (
          <Link key={item.href} href={item.href} className="flex-1">
            <div className={`flex flex-col items-center justify-center gap-0.5 h-full text-[10px] font-medium transition-colors
              ${isActive(item.href) ? 'text-[#3182F6]' : 'text-[#48484A]'}`}>
              <span className="text-[20px]">{item.icon}</span>
              {item.label}
            </div>
          </Link>
        ))}
      </nav>
    </>
  );
}
