'use client';
// ============================================================
// app/(auth)/login/page.tsx — 로그인 페이지 v4 (Suspense 추가)
// ============================================================
import { useState, useEffect, Suspense } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Zap, Lock, Loader2 } from 'lucide-react';

// useSearchParams를 사용하는 내부 컴포넌트 (Suspense 필요)
function LoginContent() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const router       = useRouter();
  const searchParams = useSearchParams();
  const supabase     = createClient();

  useEffect(() => {
    const err = searchParams.get('error');
    if (err === 'rejected') setError('회원가입이 거절되었습니다. 관리자에게 문의하세요.');
  }, [searchParams]);

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError('');
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({ email, password });
      if (authErr) { setError('이메일 또는 비밀번호가 올바르지 않습니다'); return; }

      // 승인 상태 확인
      const { data: profile } = await supabase
        .from('profiles').select('status, role').eq('id', data.user.id).single();

      if (profile?.status === 'pending') {
        await supabase.auth.signOut();
        router.push('/pending');
        return;
      }
      if (profile?.status === 'rejected') {
        await supabase.auth.signOut();
        setError('계정이 거절되었습니다. 관리자에게 문의하세요.');
        return;
      }

      router.push('/dashboard');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div style={{
      width: '100%',
      maxWidth: 420,
      background: '#ffffff',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: '36px 32px',
      boxShadow: 'var(--shadow-md)',
    }}>
      {/* 로고 */}
      <div style={{ textAlign: 'center', marginBottom: 32 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 10, margin: '0 auto 14px',
          background: 'var(--accent)', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Zap size={22} strokeWidth={2.2} /></div>
        <h1 style={{ margin: '0 0 4px' }}>전기안전관리</h1>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>직무고시 점검 자동화</p>
      </div>

      {/* 에러 */}
      {error && (
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 8,
          background: 'var(--negative-soft)', color: 'var(--negative)',
          border: '1px solid rgba(201,54,54,.2)', fontSize: 13, fontWeight: 500,
        }}>{error}</div>
      )}

      {/* 입력 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            이메일
          </label>
          <input
            type="email"
            style={{
              width: '100%', padding: '12px 14px',
              background: '#ffffff', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 14, color: 'var(--text-primary)',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
            placeholder="example@company.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            비밀번호
          </label>
          <input
            type="password"
            style={{
              width: '100%', padding: '12px 14px',
              background: '#ffffff', border: '1px solid var(--border)',
              borderRadius: 8, fontSize: 14, color: 'var(--text-primary)',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
            }}
            placeholder="비밀번호 입력"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      <button
        onClick={handleLogin}
        disabled={loading || !email || !password}
        style={{
          width: '100%', padding: '14px 0',
          background: loading || !email || !password
            ? 'var(--text-tertiary)'
            : 'var(--accent)',
          color: '#fff', border: 'none', borderRadius: 8,
          fontSize: 15, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit', transition: 'all .15s',
        }}
      >
        {loading ? <><Loader2 size={17} className="spin" /> 로그인하는 중</> : '로그인'}
      </button>

      {/* 안내 */}
      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>계정이 없으면 </span>
        <Link href="/register" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 14, textDecoration: 'none' }}>
          가입 신청
        </Link>
      </div>

      {/* 보안 안내 */}
      <div style={{
        marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center',
        fontSize: 12, color: 'var(--text-tertiary)',
      }}>
        <Lock size={13} /> 내 계정에 등록된 관리구역만 볼 수 있습니다.
      </div>
    </div>
  );
}

// 메인 페이지 컴포넌트 - Suspense로 감싸서 useSearchParams 지원
export default function LoginPage() {
  return (
    <div style={{
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 16px',
      background: 'var(--bg-page)',
    }}>
      <Suspense fallback={
        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>불러오는 중</div>
      }>
        <LoginContent />
      </Suspense>
    </div>
  );
}
