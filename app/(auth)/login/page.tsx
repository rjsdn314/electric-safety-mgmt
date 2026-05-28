'use client';
// ============================================================
// app/(auth)/login/page.tsx — 로그인 페이지 v3 (중앙 정렬 수정)
// ============================================================
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
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
      minHeight: '100vh',
      width: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '20px 16px',
      background: 'var(--bg-page)',
      backgroundImage: 'radial-gradient(ellipse 600px 400px at 50% 0%, rgba(0,102,255,.05), transparent)',
    }}>
      <div style={{
        width: '100%',
        maxWidth: 420,
        background: '#ffffff',
        border: '1px solid var(--border)',
        borderRadius: 20,
        padding: '40px 40px',
        boxShadow: '0 4px 16px rgba(0,102,255,.06), 0 2px 4px rgba(15,23,42,.04)',
      }}>
        {/* 로고 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #0066ff, #00b8d9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26,
          }}>⚡</div>
          <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6, letterSpacing: '-0.5px', margin: '0 0 6px' }}>
            전기안전관리
          </h1>
          <p style={{ fontSize: 13, color: '#4b5563', margin: 0 }}>직무고시 자동화 시스템</p>
        </div>

        {/* 에러 */}
        {error && (
          <div style={{
            marginBottom: 20, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(239,68,68,.08)', color: '#dc2626',
            border: '1px solid rgba(239,68,68,.2)', fontSize: 13, fontWeight: 500,
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
                background: '#f6f8fc', border: '1.5px solid #e4e9f0',
                borderRadius: 10, fontSize: 14, color: '#111827',
                outline: 'none', fontFamily: 'inherit', letterSpacing: '-0.02em',
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
                background: '#f6f8fc', border: '1.5px solid #e4e9f0',
                borderRadius: 10, fontSize: 14, color: '#111827',
                outline: 'none', fontFamily: 'inherit', letterSpacing: '-0.02em',
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
              ? '#9ca3af'
              : 'linear-gradient(135deg, #0066ff, #00b8d9)',
            color: '#fff', border: 'none', borderRadius: 99,
            fontSize: 15, fontWeight: 700,
            cursor: loading || !email || !password ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', transition: 'all .15s',
          }}
        >
          {loading ? '로그인 중...' : '로그인'}
        </button>

        {/* 안내 */}
        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: '#4b5563', marginBottom: 12 }}>
            아직 계정이 없으신가요?
          </p>
          <Link href="/register" style={{
            display: 'block', padding: '12px 0',
            border: '1.5px solid #0066ff',
            borderRadius: 99, color: '#0066ff',
            fontWeight: 700, fontSize: 14, textDecoration: 'none',
            transition: 'all .15s',
          }}>
            회원가입 신청
          </Link>
        </div>

        {/* 보안 안내 */}
        <div style={{
          marginTop: 20, padding: '14px 16px', borderRadius: 10,
          background: '#f6f8fc', border: '1px solid #e4e9f0',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 16, flexShrink: 0 }}>🔒</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>계정별 데이터 분리</div>
            <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.6 }}>
              로그인한 계정에 등록된 관리구역만 접근 가능합니다
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
