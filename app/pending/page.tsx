'use client';
// ============================================================
// app/pending/page.tsx — 승인 대기 안내 페이지
// ============================================================
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { Clock, Check } from 'lucide-react';

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
        width: '100%', maxWidth: 480, padding: '40px 32px', textAlign: 'center',
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-md)',
      }}>
        {/* 아이콘 */}
        <div style={{
          width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
          background: 'var(--warning-soft)', color: 'var(--warning)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}><Clock size={24} /></div>

        <h1 style={{ margin: '0 0 8px' }}>승인을 기다리고 있습니다</h1>
        <p style={{ fontSize: 14, color: 'var(--mid)', lineHeight: 1.7, marginBottom: 24 }}>
          가입 신청을 받았습니다.<br />
          관리자가 승인하면 이메일로 알려 드립니다.
        </p>

        {/* 정보 카드 */}
        <div style={{
          padding: '14px 18px', borderRadius: 8, marginBottom: 20,
          background: 'var(--bg-elevated)',
          border: '1px solid var(--border)',
          textAlign: 'left',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            진행 순서
          </div>
          {[
            ['1', '신청 접수', 'done'],
            ['2', '관리자 검토 중', 'active'],
            ['3', '승인과 계정 활성화', 'todo'],
            ['4', '이메일 안내', 'todo'],
          ].map(([num, label, state]) => (
            <div key={num} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 0',
              borderBottom: num !== '4' ? '1px solid var(--border)' : 'none',
            }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 600,
                background: state === 'done' ? 'var(--positive-soft)'
                  : state === 'active' ? 'var(--accent-soft)' : 'var(--bg-card)',
                border: state === 'todo' ? '1px solid var(--border)' : 'none',
                color: state === 'done' ? 'var(--positive)'
                  : state === 'active' ? 'var(--accent)' : 'var(--text-tertiary)',
              }}>
                {state === 'done' ? <Check size={13} strokeWidth={2.5} /> : num}
              </div>
              <span style={{
                fontSize: 13,
                color: state === 'done' ? 'var(--positive)'
                  : state === 'active' ? 'var(--text-primary)' : 'var(--dim)',
                fontWeight: state === 'active' ? 600 : 400,
              }}>{label}</span>
            </div>
          ))}
        </div>

        {/* 관리자 연락처 */}
        <div style={{
          padding: '12px 16px', borderRadius: 8, marginBottom: 20,
          background: 'var(--bg-card)', border: '1px solid var(--border)',
          fontSize: 13, color: 'var(--mid)',
        }}>
          문의: <strong style={{ color: 'var(--text)' }}>황건우</strong>{' '}
          <a href="mailto:rjsdn43666211@gmail.com" style={{ color: 'var(--accent)' }}>
            rjsdn43666211@gmail.com
          </a>
        </div>

        <button
          onClick={handleLogout}
          style={{
            width: '100%', padding: '11px 0', borderRadius: 8,
            border: '1px solid var(--border-hover)', background: 'transparent',
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
