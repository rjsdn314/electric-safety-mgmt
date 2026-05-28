'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const [userInfo, setUserInfo] = useState<any>(null);

  useEffect(() => {
    const fetchUser = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, email, role, inspector_name')
          .eq('id', user.id)
          .single();
        setUserInfo(profile);
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

  const menus = [
    { href: '/dashboard', label: '대시보드', icon: '🏠' },
    { href: '/inspection', label: '점검 생성', icon: '📋' },
    { href: '/history', label: '점검 이력', icon: '📁' },
  ];

  return (
    <aside style={{
      width: 260,
      height: '100vh',
      background: 'var(--bg-card)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      padding: '24px 16px',
      position: 'sticky',
      top: 0,
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

      {/* 메뉴 라벨 */}
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)',
        letterSpacing: '0.06em', textTransform: 'uppercase',
        marginBottom: 8, padding: '0 8px',
      }}>메뉴</div>

      {/* 네비게이션 */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
        {menus.map(m => {
          const active = pathname === m.href || pathname?.startsWith(m.href + '/');
          return (
            <Link key={m.href} href={m.href} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 14px', borderRadius: 10,
              textDecoration: 'none', fontSize: 14, fontWeight: 600,
              color: active ? 'var(--accent)' : 'var(--text-secondary)',
              background: active ? 'var(--accent-soft)' : 'transparent',
              transition: 'all .15s',
            }}>
              <span style={{ fontSize: 18 }}>{m.icon}</span>
              <span>{m.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 사용자 영역 */}
      <div style={{
        marginTop: 'auto', padding: '12px 16px',
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          background: 'linear-gradient(135deg, var(--blue), var(--cyan))',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, fontWeight: 700, flexShrink: 0,
        }}>
          {userInfo?.name?.[0] || '?'}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 13, fontWeight: 700,
            color: 'var(--text-primary)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {userInfo?.name || '사용자'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>
            {userInfo?.role === 'admin' ? '관리자' : '담당자'}
          </div>
        </div>
        <button onClick={handleLogout} title="로그아웃" style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 16, padding: 4, color: 'var(--text-tertiary)',
          transition: 'all .15s',
        }}>🚪</button>
      </div>
    </aside>
  );
}
