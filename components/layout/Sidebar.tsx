'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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

  const menus = [
    { href: '/dashboard',        label: '대시보드',      icon: '🏠' },
    { href: '/inspection',       label: '점검 생성',     icon: '📋' },
    { href: '/history',          label: '점검 이력',     icon: '📁' },
    { href: '/stations/upload',  label: '관리구역 등록', icon: '📂' },
  ];

  const adminMenus = [
    { href: '/admin/users', label: '사용자 관리', icon: '👥' },
  ];

  const isActive = (href: string) =>
    pathname === href || pathname?.startsWith(href + '/');

  const linkStyle = (href: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '10px 14px', borderRadius: 10,
    textDecoration: 'none', fontSize: 14, fontWeight: 600,
    color: isActive(href) ? 'var(--accent)' : 'var(--text-secondary)',
    background: isActive(href) ? 'var(--accent-soft)' : 'transparent',
    transition: 'all .15s',
  });

  return (
    <>
      {/* 모바일 상단 헤더 (햄버거 버튼) */}
      <div className="mobile-topbar">
        <button onClick={() => setOpen(true)} aria-label="메뉴 열기" style={{
          background: 'transparent', border: 'none', fontSize: 24, cursor: 'pointer',
          color: 'var(--text-primary)', padding: 4, lineHeight: 1,
        }}>☰</button>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 15, fontWeight: 800 }}>
          <span>⚡</span>
          <span style={{ background: 'linear-gradient(135deg, #0066ff, #00b8d9)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>전기안전관리</span>
        </span>
      </div>

      {/* 모바일 오버레이 (열렸을 때 배경 어둡게) */}
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      <aside className={open ? 'app-sidebar open' : 'app-sidebar'} style={{
      width: 260, height: '100vh',
      background: 'var(--bg-card)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      padding: '24px 16px',
      position: 'sticky', top: 0,
      overflowY: 'auto',
      boxShadow: 'var(--shadow)',
      zIndex: 100,
    }}>
      {/* WATER 로고 */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        marginBottom: 28, padding: '10px 12px',
        background: 'linear-gradient(135deg, rgba(0,102,255,0.06), rgba(0,184,217,0.06))',
        border: '1px solid rgba(0,102,255,0.15)',
        borderRadius: 12,
      }}>
        <span style={{ fontSize: 20 }}>⚡</span>
        <span style={{
          fontSize: 14, fontWeight: 800, letterSpacing: '-0.5px',
          background: 'linear-gradient(135deg, #0066ff, #00b8d9)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}>전기안전관리</span>
      </div>

      {/* 일반 메뉴 */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
        marginBottom: 8, padding: '0 8px',
      }}>메뉴</div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {menus.map(m => (
          <Link key={m.href} href={m.href} style={linkStyle(m.href)} onClick={() => setOpen(false)}>
            <span style={{ fontSize: 18 }}>{m.icon}</span>
            <span>{m.label}</span>
          </Link>
        ))}
      </nav>

      {/* 관리자 전용 메뉴 */}
      {isAdmin && (
        <>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            margin: '16px 0 8px', padding: '0 8px',
          }}>관리자</div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {adminMenus.map(m => (
              <Link key={m.href} href={m.href} style={linkStyle(m.href)} onClick={() => setOpen(false)}>
                <span style={{ fontSize: 18 }}>{m.icon}</span>
                <span>{m.label}</span>
              </Link>
            ))}
          </nav>
        </>
      )}

      {/* 사용자 영역 */}
      <div style={{
        marginTop: 'auto', padding: '14px 16px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--blue, #0066ff), var(--cyan, #00b8d9))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 15, fontWeight: 800, flexShrink: 0,
          }}>
            {userInfo?.name?.[0] || '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13, fontWeight: 800, color: 'var(--text-primary)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {userInfo?.name || '사용자'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600 }}>
              {userInfo?.role === 'admin' ? '관리자' : '담당자'}
              {userInfo?.sectors?.name && ` · ${userInfo.sectors.name}`}
            </div>
          </div>
        </div>
        <button onClick={handleLogout} title="로그아웃" style={{
          width: '100%',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          borderRadius: 10, cursor: 'pointer',
          fontSize: 13, fontWeight: 700, padding: '10px',
          color: 'var(--text-secondary)', fontFamily: 'inherit',
          transition: 'all .15s',
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span>로그아웃</span>
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
