'use client';
// ============================================================
// app/pending/page.tsx — 승인 대기 안내 페이지
// ============================================================
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function PendingPage() {
  const router   = useRouter();
  const supabase = createClient();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg-page)', padding: '20px 16px',
    }}>
      <div style={{
        width: '100%', maxWidth: 480, padding: '48px 40px', textAlign: 'center',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)',
      }}>
        {/* 아이콘 */}
        <div style={{
          width: 72, height: 72, borderRadius: 20, margin: '0 auto 20px',
          background: 'rgba(245,158,11,.1)',
          border: '2px solid rgba(245,158,11,.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36,
        }}>⏳</div>

        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 10, letterSpacing: '-0.5px' }}>
          승인 대기 중
        </h1>
        <p style={{ fontSize: 14, color: 'var(--mid)', lineHeight: 1.8, marginBottom: 28 }}>
          회원가입 신청이 접수되었습니다.<br />
          관리자 확인 후 승인되면 이메일로 안내드립니다.
        </p>

        {/* 정보 카드 */}
        <div style={{
          padding: '18px 20px', borderRadius: 12, marginBottom: 24,
          background: 'rgba(0,102,255,.05)',
          border: '1px solid rgba(0,102,255,.15)',
          textAlign: 'left',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--blue, #0066ff)', marginBottom: 10 }}>
            📋 처리 절차
          </div>
          {[
            ['1', '신청 접수 완료', 'done'],
            ['2', '관리자 검토 중', 'active'],
            ['3', '승인 및 계정 활성화', 'todo'],
            ['4', '이메일 알림 발송', 'todo'],
          ].map(([num, label, state]) => (
            <div key={num} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0',
              borderBottom: num !== '4' ? '1px solid rgba(0,102,255,.08)' : 'none',
            }}>
              <div style={{
                width: 24, height: 24, borderRadius: 8, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800,
                background: state === 'done' ? 'rgba(16,185,129,.15)'
                  : state === 'active' ? 'rgba(0,102,255,.12)' : 'rgba(0,0,0,.06)',
                color: state === 'done' ? '#059669'
                  : state === 'active' ? '#0066ff' : '#9ca3af',
              }}>
                {state === 'done' ? '✓' : num}
              </div>
              <span style={{
                fontSize: 13,
                color: state === 'done' ? '#059669'
                  : state === 'active' ? 'var(--text-primary)' : 'var(--dim)',
                fontWeight: state === 'active' ? 700 : 400,
              }}>{label}</span>
            </div>
          ))}
        </div>

        {/* 관리자 연락처 */}
        <div style={{
          padding: '14px 16px', borderRadius: 10, marginBottom: 24,
          background: 'var(--bg-page)', border: '1px solid var(--border)',
          fontSize: 13, color: 'var(--mid)',
        }}>
          문의: <strong style={{ color: 'var(--text)' }}>황건우</strong>{' '}
          <a href="mailto:rjsdn43666211@gmail.com" style={{ color: 'var(--blue, #0066ff)' }}>
            rjsdn43666211@gmail.com
          </a>
        </div>

        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 99,
            border: '1.5px solid var(--border)', background: 'transparent',
            color: 'var(--mid)', fontSize: 14, fontWeight: 600,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
