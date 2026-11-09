'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  LayoutDashboard, ClipboardList, FolderClock, CalendarDays, Building2, FileSpreadsheet,
  DraftingCompass, PenLine, Thermometer, BookOpen, Users, Menu, Zap, LogOut, type LucideIcon,
} from 'lucide-react';

type MenuItem = { href: string; label: string; icon: LucideIcon };

// 자주 쓰는 업무 / 등록·설정 으로 묶음
const workMenus: MenuItem[] = [
  { href: '/dashboard',  label: '대시보드',  icon: LayoutDashboard },
  { href: '/inspection', label: '점검 생성', icon: ClipboardList },
  { href: '/history',    label: '점검 이력', icon: FolderClock },
  { href: '/calendar',   label: '캘린더',    icon: CalendarDays },
];
const setupMenus: MenuItem[] = [
  { href: '/stations/upload', label: '관리구역',        icon: Building2 },
  { href: '/admin/templates', label: '점검 양식',       icon: FileSpreadsheet },
  { href: '/annual-builder',  label: '연차 양식 만들기', icon: DraftingCompass },
  { href: '/signature',       label: '서명',            icon: PenLine },
  { href: '/thermal-parts',   label: '열화상 부위',     icon: Thermometer },
  { href: '/guide',           label: '사용설명서',      icon: BookOpen },
];
const adminMenus: MenuItem[] = [
  { href: '/admin/users', label: '사용자 관리', icon: Users },
];

function Logo() {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{
        width: 28, height: 28, borderRadius: 7, background: 'var(--accent)', color: '#fff',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Zap size={16} strokeWidth={2.2} />
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.2 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>전기안전관리</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>직무고시 점검 자동화</span>
      </span>
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const router   = useRouter();
  const [userInfo, setUserInfo] = useState<any>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, email, role, status, inspector_name, sectors(name)')
          .eq('id', user.id)
          .single();
        setUserInfo(profile);

        // 미승인 사용자 → 대기 안내 페이지
        if (profile?.status === 'pending') {
          router.replace('/pending');
          return;
        }
        if (profile?.status === 'rejected') {
          await supabase.auth.signOut();
          router.replace('/login?error=rejected');
        }
      }
    };
    fetchUser();
  }, []);

  const handleLogout = async () => {
    if (!confirm('로그아웃 하시겠습니까?')) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
  };

  const isAdmin = userInfo?.role === 'admin';
  const canUseCalendar = ['황건우', '조강민'].includes((userInfo?.name || '').trim());

  // 회원가입 승인요청 개수 — 관리자에게만, 1분마다 갱신
  const [pendingCount, setPendingCount] = useState(0);
  useEffect(() => {
    if (!isAdmin) return;
    const supabase = createClient();
    const load = async () => {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      setPendingCount(count || 0);
    };
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [isAdmin]);

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/');

  const linkStyle = (href: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '8px 10px', borderRadius: 7,
    textDecoration: 'none', fontSize: 14, fontWeight: isActive(href) ? 600 : 500,
    color: isActive(href) ? 'var(--accent)' : 'var(--text-secondary)',
    background: isActive(href) ? 'var(--accent-soft)' : 'transparent',
  });
  const sectionLabel: React.CSSProperties = {
    fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', margin: '18px 0 6px', padding: '0 10px',
  };
  const renderLinks = (items: MenuItem[]) => items.map(({ href, label, icon: Icon }) => (
    <Link key={href} href={href} style={linkStyle(href)} onClick={() => setOpen(false)}>
      <Icon size={18} strokeWidth={1.8} />
      <span>{label}</span>
      {href === '/admin/users' && pendingCount > 0 && (
        <span title="승인 대기" style={{
          marginLeft: 'auto', fontSize: 11, fontWeight: 700, lineHeight: 1,
          padding: '3px 7px', borderRadius: 999, background: 'var(--negative)', color: '#fff', flexShrink: 0,
        }}>{pendingCount}</span>
      )}
    </Link>
  ));

  return (
    <>
      {/* 모바일 상단 헤더 */}
      <div className="mobile-topbar">
        <button onClick={() => setOpen(true)} aria-label="메뉴 열기" style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-primary)', padding: 4, lineHeight: 0,
        }}><Menu size={22} /></button>
        <Logo />
      </div>

      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      <aside className={open ? 'app-sidebar open' : 'app-sidebar'} style={{
        width: 240, height: '100vh',
        background: 'var(--bg-card)',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        padding: '20px 12px',
        position: 'sticky', top: 0,
        overflowY: 'auto',
        zIndex: 100,
      }}>
        <div style={{ padding: '4px 10px 4px' }}><Logo /></div>

        <div style={sectionLabel}>업무</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {renderLinks(workMenus.filter(m => m.href !== '/calendar' || canUseCalendar))}
        </nav>

        <div style={sectionLabel}>등록·설정</div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {renderLinks(setupMenus)}
        </nav>

        {isAdmin && (
          <>
            <div style={sectionLabel}>관리자</div>
            <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {renderLinks(adminMenus)}
            </nav>
          </>
        )}

        {/* 사용자 영역 */}
        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 6px 0' }}>
          <div style={{
            width: 32, height: 32, borderRadius: '50%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-secondary)', fontSize: 13, fontWeight: 700, flexShrink: 0,
          }}>
            {userInfo?.name?.[0] || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userInfo?.name || '사용자'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {userInfo?.role === 'admin' ? '관리자' : '담당자'}{userInfo?.sectors?.name ? `, ${userInfo.sectors.name}` : ''}
            </div>
          </div>
          <button onClick={handleLogout} title="로그아웃" aria-label="로그아웃" style={{
            background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, cursor: 'pointer',
            padding: 7, color: 'var(--text-secondary)', lineHeight: 0,
          }}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      <style>{`
        .mobile-topbar { display: none; }
        @media (max-width: 768px) {
          .mobile-topbar {
            display: flex;
            align-items: center;
            gap: 12px;
            position: fixed;
            top: 0; left: 0; right: 0;
            height: 56px;
            padding: 0 16px;
            background: var(--bg-card);
            border-bottom: 1px solid var(--border);
            z-index: 200;
          }
          .app-sidebar {
            position: fixed !important;
            top: 0; left: 0;
            transform: translateX(-100%);
            transition: transform .25s ease;
            z-index: 9999 !important;
          }
          .app-sidebar.open { transform: translateX(0); }
          .sidebar-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.45);
            z-index: 250;
          }
        }
      `}</style>
    </>
  );
}
