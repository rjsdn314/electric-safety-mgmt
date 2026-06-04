'use client';
// ============================================================
// app/(auth)/register/page.tsx — 회원가입 페이지
// ============================================================
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const supabase = createClient();

  const [form, setForm] = useState({
    email: '', password: '', confirmPassword: '',
    name: '', company: '', phone: '', message: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(false);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async () => {
    setError('');
    if (!form.email || !form.password || !form.name) {
      setError('이메일, 비밀번호, 이름은 필수 입력 항목입니다');
      return;
    }
    if (form.password.length < 8) {
      setError('비밀번호는 8자 이상이어야 합니다');
      return;
    }
    if (form.password !== form.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다');
      return;
    }
    setLoading(true);
    try {
      // 1. Supabase Auth 회원가입
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { name: form.name } },
      });
      if (authErr) throw new Error(authErr.message);
      if (!authData.user) throw new Error('회원가입에 실패했습니다');

      // 2. signup_requests 테이블에 신청 정보 저장
      await supabase.from('signup_requests').insert({
        user_id: authData.user.id,
        email:   form.email,
        name:    form.name,
        company: form.company,
        phone:   form.phone,
        message: form.message,
        status:  'pending',
      });

      // 3. 관리자 알림 + 신청 기록 (서버에서 서비스 롤로 기록)
      await fetch('/api/auth/notify-admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: authData.user.id,
          name:    form.name,
          email:   form.email,
          company: form.company,
          phone:   form.phone,
          message: form.message,
        }),
      });

      // 4. 즉시 로그아웃 (승인 전 사용 불가)
      await supabase.auth.signOut();
      setDone(true);
    } catch (e: any) {
      setError(e.message || '회원가입 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  // ── 완료 화면 ──────────────────────────────────────────────
  if (done) return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-page)',
    }}>
      <div style={{
        width: '100%', maxWidth: 480, padding: 48,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', textAlign: 'center',
        boxShadow: 'var(--shadow-md)',
      }}>
        <div style={{ fontSize: 56, marginBottom: 16 }}>📬</div>
        <h2 style={{ fontSize: 22, fontWeight: 900, marginBottom: 10, letterSpacing: '-0.5px' }}>
          신청이 접수되었습니다
        </h2>
        <p style={{ fontSize: 14, color: 'var(--mid)', lineHeight: 1.7, marginBottom: 28 }}>
          관리자 확인 후 승인 메일이 발송됩니다.<br />
          승인 완료 시 로그인하실 수 있습니다.
        </p>
        <div style={{
          padding: '16px 20px',
          background: 'rgba(0,102,255,.06)',
          border: '1px solid rgba(0,102,255,.15)',
          borderRadius: 10, fontSize: 13, color: 'var(--mid)',
          marginBottom: 24,
        }}>
          <strong style={{ color: 'var(--blue)' }}>관리자 이메일:</strong> rjsdn43666211@gmail.com
        </div>
        <Link href="/login" style={{
          display: 'block', padding: '14px 0',
          background: 'linear-gradient(135deg, #0066ff, #00b8d9)',
          color: '#fff', borderRadius: 99, fontWeight: 700, fontSize: 14,
          textDecoration: 'none',
        }}>
          로그인 페이지로 이동
        </Link>
      </div>
    </div>
  );

  // ── 입력 폼 ────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    background: 'var(--bg-page)', border: '1.5px solid var(--border)',
    borderRadius: 10, fontSize: 14, color: 'var(--text-primary)',
    outline: 'none', fontFamily: 'inherit', letterSpacing: '-0.02em',
    boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 13, fontWeight: 600,
    color: 'var(--text-primary)', marginBottom: 6,
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-page)', padding: '24px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 500,
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', padding: '40px 40px',
        boxShadow: 'var(--shadow-md)',
      }}>
        {/* 헤더 */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 16, margin: '0 auto 14px',
            background: 'linear-gradient(135deg, #0066ff, #00b8d9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26,
          }}>⚡</div>
          <h1 style={{ fontSize: 20, fontWeight: 900, marginBottom: 6, letterSpacing: '-0.5px' }}>
            회원가입 신청
          </h1>
          <p style={{ fontSize: 13, color: 'var(--mid)' }}>
            관리자 승인 후 서비스를 이용하실 수 있습니다
          </p>
        </div>

        {/* 오류 */}
        {error && (
          <div style={{
            marginBottom: 20, padding: '12px 16px', borderRadius: 10,
            background: 'rgba(239,68,68,.08)', color: '#dc2626',
            border: '1px solid rgba(239,68,68,.2)', fontSize: 13, fontWeight: 500,
          }}>{error}</div>
        )}

        {/* 필수 항목 */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--blue)',
            letterSpacing: '0.05em', textTransform: 'uppercase',
            marginBottom: 12,
            fontFamily: "'JetBrains Mono', monospace",
          }}>필수 정보</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>이름 *</label>
              <input style={inputStyle} placeholder="홍길동" value={form.name} onChange={set('name')} />
            </div>
            <div>
              <label style={labelStyle}>이메일 *</label>
              <input style={inputStyle} type="email" placeholder="example@company.com"
                value={form.email} onChange={set('email')} />
            </div>
            <div>
              <label style={labelStyle}>비밀번호 * (8자 이상)</label>
              <input style={inputStyle} type="password" placeholder="비밀번호 입력"
                value={form.password} onChange={set('password')} />
            </div>
            <div>
              <label style={labelStyle}>비밀번호 확인 *</label>
              <input style={inputStyle} type="password" placeholder="비밀번호 재입력"
                value={form.confirmPassword} onChange={set('confirmPassword')} />
            </div>
          </div>
        </div>

        {/* 선택 항목 */}
        <div style={{ marginBottom: 24 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: 'var(--dim)',
            letterSpacing: '0.05em', textTransform: 'uppercase',
            marginBottom: 12,
            fontFamily: "'JetBrains Mono', monospace",
          }}>추가 정보 (선택)</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label style={labelStyle}>소속 회사</label>
              <input style={inputStyle} placeholder="(주)회사명" value={form.company} onChange={set('company')} />
            </div>
            <div>
              <label style={labelStyle}>연락처</label>
              <input style={inputStyle} placeholder="010-0000-0000" value={form.phone} onChange={set('phone')} />
            </div>
            <div>
              <label style={labelStyle}>신청 사유</label>
              <textarea
                style={{ ...inputStyle, resize: 'none', height: 80 } as React.CSSProperties}
                placeholder="담당 구역 및 사용 목적 등"
                value={form.message}
                onChange={set('message')}
              />
            </div>
          </div>
        </div>

        {/* 안내 박스 */}
        <div style={{
          padding: '14px 16px', borderRadius: 10, marginBottom: 20,
          background: 'rgba(0,102,255,.06)', border: '1px solid rgba(0,102,255,.15)',
          display: 'flex', gap: 10, alignItems: 'flex-start',
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>🔒</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>관리자 승인 방식</div>
            <div style={{ fontSize: 11, color: 'var(--mid)', lineHeight: 1.6 }}>
              신청 후 관리자(황건우)의 승인이 완료되면 이메일로 안내드립니다.
              승인 완료 전까지는 로그인이 제한됩니다.
            </div>
          </div>
        </div>

        {/* 제출 버튼 */}
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%', padding: '14px 0',
            background: loading ? 'var(--dim)' : 'linear-gradient(135deg, #0066ff, #00b8d9)',
            color: '#fff', border: 'none', borderRadius: 99,
            fontSize: 15, fontWeight: 700, cursor: loading ? 'wait' : 'pointer',
            fontFamily: 'inherit', transition: 'all .15s',
          }}
        >
          {loading ? '신청 중...' : '회원가입 신청'}
        </button>

        <p style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: 'var(--mid)' }}>
          이미 계정이 있으신가요?{' '}
          <Link href="/login" style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none' }}>
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
