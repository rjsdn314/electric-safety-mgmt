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
      width: 240, height: '100vh', background: 'var(--bg-card)',
      borderRight: '1px solid var(--border)', display: 'flex',
      flexDirection: 'column', padding: '24px 16px',
    }}>
      <div style={{display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, padding: '0 8px'}}>
        <span style={{fontSize: 24}}>⚡</span>
        <span style={{fontSize: 16, fontWeight: 700}}>전기안전관리</span>
      </div>

      <div style={{fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, padding: '0 8px'}}>메뉴</div>

      <nav style={{display: 'flex', flexDirection: 'column', gap: 4, flex: 1}}>
        {menus.map(m => {
          const active = pathname === m.href || pathname?.startsWith(m.href + '/');
          return (
            <Link key={m.href} href={m.href} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px',
              borderRadius: 10, textDecoration: 'none', fontSize: 14, fontWeight: 600,
              color: active ? 'var(--accent)' : 'var(--text-primary)',
              background: active ? 'var(--accent-soft)' : 'transparent',
            }}>
              <span style={{fontSize: 18}}>{m.icon}</span>
              <span>{m.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 사용자 영역 */}
      <div style={{
        marginTop: 'auto', padding: '12px 16px', background: 'var(--bg-elevated)',
        borderRadius: 12, display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%', background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 14, fontWeight: 700,
        }}>
          {userInfo?.name?.[0] || '?'}
        </div>
        <div style={{flex: 1, minWidth: 0}}>
          <div style={{fontSize: 13, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
            {userInfo?.name || '사용자'}
          </div>
          <div style={{fontSize: 10, color: 'var(--text-secondary)'}}>
            {userInfo?.role === 'admin' ? '관리자' : '담당자'}
          </div>
        </div>
        <button onClick={handleLogout} title="로그아웃" style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          fontSize: 18, padding: 4, color: 'var(--text-secondary)',
        }}>🚪</button>
      </div>
    </aside>
  );
}