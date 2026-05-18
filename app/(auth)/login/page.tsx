'use client';
// ============================================================
// app/(auth)/login/page.tsx — 로그인 페이지
// ============================================================
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('이메일 또는 비밀번호가 올바르지 않습니다');
    } else {
      router.push('/dashboard');
    }
    setLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLogin();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
      style={{
        background: 'var(--bg-primary)',
        backgroundImage: 'radial-gradient(ellipse 600px 400px at 50% 0%, rgba(49,130,246,.06), transparent)',
      }}>
      <div className="w-full max-w-[400px] p-10 rounded-[24px]"
        style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>

        {/* 로고 */}
        <div className="text-center mb-8">
          <div className="w-[52px] h-[52px] rounded-[16px] flex items-center justify-center text-[26px] mx-auto mb-3.5"
            style={{ background: 'var(--accent)' }}>⚡</div>
          <h1 className="text-xl font-[800]">전기안전관리</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>직무고시 자동화 시스템</p>
        </div>

        {/* 에러 */}
        {error && (
          <div className="mb-4 px-4 py-3 rounded-[10px] text-sm font-medium"
            style={{ background: 'rgba(240,68,82,.1)', color: '#F04452', border: '1px solid rgba(240,68,82,.2)' }}>
            {error}
          </div>
        )}

        {/* 입력 */}
        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-sm font-semibold mb-1.5">이메일</label>
            <input
              type="email"
              className="toss-input"
              placeholder="example@company.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">비밀번호</label>
            <input
              type="password"
              className="toss-input"
              placeholder="비밀번호 입력"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
            />
          </div>
        </div>

        <button
          className="toss-btn-primary"
          onClick={handleLogin}
          disabled={loading || !email || !password}
          style={{ opacity: loading || !email || !password ? 0.6 : 1 }}>
          {loading ? '로그인 중...' : '로그인'}
        </button>

        {/* 안내 */}
        <p className="mt-4 text-center text-xs" style={{ color: 'var(--text-secondary)' }}>
          계정이 없으신가요? 담당자에게 계정 발급을 요청하세요
        </p>

        <div className="mt-5 p-3.5 rounded-[10px] flex gap-2.5 items-start"
          style={{ background: 'var(--bg-elevated)' }}>
          <span className="text-base flex-shrink-0">🔒</span>
          <div>
            <div className="text-xs font-semibold mb-0.5">계정별 데이터 분리</div>
            <div className="text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              로그인한 섹터의 충전소 데이터만 접근 가능합니다
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
