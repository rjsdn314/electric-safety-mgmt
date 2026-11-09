'use client';
// ============================================================
// app/(dashboard)/admin/users/page.tsx — 관리자: 사용자 관리
// ============================================================
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useRouter } from 'next/navigation';
import { RefreshCw, MessageSquare, Phone, Check, X } from 'lucide-react';

type UserRow = {
  id: string; email: string; name: string;
  role: string; status: string; created_at: string;
  approved_at?: string; sector_name?: string;
  station_count?: number; inspection_count?: number;
  company?: string; phone?: string; message?: string;
};

const STATUS_BADGE: Record<string, { bg: string; color: string; label: string }> = {
  pending:  { bg: 'var(--warning-soft)',  color: 'var(--warning)',  label: '승인 대기' },
  approved: { bg: 'var(--positive-soft)', color: 'var(--positive)', label: '승인됨'   },
  rejected: { bg: 'var(--negative-soft)', color: 'var(--negative)', label: '거절됨'   },
};

export default function AdminUsersPage() {
  const { profile, loading: authLoading } = useAuth();
  const router = useRouter();
  const supabase = createClient();

  const [users,   setUsers]   = useState<UserRow[]>([]);
  const [sectors, setSectors] = useState<{id:string;name:string}[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter,  setFilter]  = useState<'all'|'pending'|'approved'|'rejected'>('pending');
  const [modal,   setModal]   = useState<{ user: UserRow; action: 'approve'|'reject' } | null>(null);
  const [note,    setNote]    = useState('');
  const [selectedSector, setSelectedSector] = useState('');
  const [processing, setProcessing] = useState(false);

  // 관리자 체크
  useEffect(() => {
    if (!authLoading && profile?.role !== 'admin') router.replace('/dashboard');
  }, [profile, authLoading]);

  const loadData = async () => {
    setLoading(true);
    const { data: requests } = await supabase
      .from('signup_requests')
      .select('user_id, company, phone, message')
      .order('created_at', { ascending: false });

    const reqMap = new Map(requests?.map(r => [r.user_id, r]) || []);

    let q = supabase.from('profiles')
      .select('id, email, name, role, status, created_at, approved_at, sector_id, sectors(name)')
      .neq('role', 'admin')
      .order('created_at', { ascending: false });

    if (filter !== 'all') q = (q as any).eq('status', filter);
    const { data: profiles } = await q;

    const rows: UserRow[] = (profiles || []).map((p: any) => ({
      id:         p.id,
      email:      p.email,
      name:       p.name || '이름없음',
      role:       p.role,
      status:     p.status,
      created_at: p.created_at,
      approved_at: p.approved_at,
      sector_name: p.sectors?.name,
      company:    reqMap.get(p.id)?.company || '',
      phone:      reqMap.get(p.id)?.phone   || '',
      message:    reqMap.get(p.id)?.message || '',
    }));

    setUsers(rows);

    const { data: secs } = await supabase.from('sectors').select('id, name');
    setSectors(secs || []);
    setLoading(false);
  };

  useEffect(() => { if (profile?.role === 'admin') loadData(); }, [filter, profile]);

  const handleAction = async () => {
    if (!modal) return;
    setProcessing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/admin/approve-user', {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          user_id:   modal.user.id,
          action:    modal.action,
          note,
          sector_id: modal.action === 'approve' ? (selectedSector || undefined) : undefined,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error);
      setModal(null);
      setNote('');
      setSelectedSector('');
      loadData();
    } catch (e: any) {
      alert('처리 실패: ' + e.message);
    } finally {
      setProcessing(false);
    }
  };

  const toggleRole = async (userId: string, currentRole: string) => {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!confirm(`역할을 '${newRole}'으로 변경하시겠습니까?`)) return;
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    loadData();
  };

  if (authLoading || profile?.role !== 'admin') return null;

  const badge = (status: string) => STATUS_BADGE[status] || STATUS_BADGE.pending;

  return (
    <div className="page-pad" style={{ padding: '28px 32px 60px', maxWidth: 1100 }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 4px' }}>사용자 관리</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--mid)' }}>가입 신청을 승인하고 계정을 관리합니다.</p>
      </div>

      {/* 필터 탭 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['pending','approved','rejected','all'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600,
            border: `1px solid ${filter === f ? 'var(--accent)' : 'var(--border)'}`,
            background: filter === f ? 'var(--accent-soft)' : 'var(--bg-card)',
            color: filter === f ? 'var(--accent)' : 'var(--mid)',
            cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {{ pending:'승인 대기', approved:'승인됨', rejected:'거절됨', all:'전체' }[f]}
            {f === 'pending' && users.filter(u => u.status === 'pending').length > 0 && filter !== 'pending' && (
              <span style={{
                marginLeft: 6, background: 'var(--negative)', color: '#fff',
                borderRadius: 99, padding: '1px 6px', fontSize: 11, fontWeight: 700,
              }}>
                {users.filter(u => u.status === 'pending').length}
              </span>
            )}
          </button>
        ))}
        <button onClick={loadData} style={{
          marginLeft: 'auto', padding: '7px 12px', borderRadius: 8, display: 'inline-flex', alignItems: 'center', gap: 6,
          border: '1px solid var(--border)', background: 'var(--bg-card)',
          color: 'var(--mid)', fontSize: 13, cursor: 'pointer',
        }}><RefreshCw size={14} /> 새로고침</button>
      </div>

      {/* 사용자 목록 */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, overflow: 'hidden',
      }}>
        {/* 테이블 헤더 */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 160px',
          gap: 12, padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-elevated)',
          fontSize: 12, fontWeight: 600, color: 'var(--dim)',
        }}>
          <div>사용자</div>
          <div>소속, 연락처</div>
          <div>관리구역</div>
          <div>상태</div>
          <div>신청일</div>
          <div></div>
        </div>

        {loading ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--dim)' }}>불러오는 중</div>
        ) : users.length === 0 ? (
          <div style={{ padding: 48, textAlign: 'center', color: 'var(--dim)', fontSize: 14 }}>
            {filter === 'pending' ? '승인을 기다리는 신청이 없습니다.' : '사용자가 없습니다.'}
          </div>
        ) : users.map(u => (
          <div key={u.id} style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr 160px',
            gap: 12, padding: '16px 20px',
            borderBottom: '1px solid var(--border)',
            alignItems: 'center', fontSize: 13,
          }}>
            {/* 사용자 */}
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{u.name}</div>
              <div style={{ fontSize: 11, color: 'var(--dim)' }}>{u.email}</div>
              {u.message && (
                <div style={{
                  marginTop: 4, fontSize: 11, color: 'var(--mid)',
                  background: 'var(--bg-elevated)', borderRadius: 5,
                  padding: '3px 8px', maxWidth: 220, display: 'flex', alignItems: 'center', gap: 4,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}><MessageSquare size={11} style={{ flexShrink: 0 }} /> {u.message}</div>
              )}
            </div>
            {/* 소속 */}
            <div>
              {u.company && <div style={{ fontSize: 12, fontWeight: 600 }}>{u.company}</div>}
              {u.phone   && <div className="ico" style={{ fontSize: 12, color: 'var(--dim)', marginTop: 2, gap: 4 }}><Phone size={11} />{u.phone}</div>}
            </div>
            {/* 관리구역 */}
            <div>
              {u.sector_name ? (
                <span style={{
                  fontSize: 12, fontWeight: 600, padding: '2px 8px',
                  borderRadius: 5, background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
                }}>{u.sector_name}</span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--dim)' }}>미배정</span>
              )}
            </div>
            {/* 상태 */}
            <div>
              <span style={{
                fontSize: 12, fontWeight: 600, padding: '2px 8px',
                borderRadius: 5, background: badge(u.status).bg, color: badge(u.status).color,
              }}>{badge(u.status).label}</span>
            </div>
            {/* 신청일 */}
            <div style={{ fontSize: 11, color: 'var(--dim)' }}>
              {new Date(u.created_at).toLocaleDateString('ko-KR')}
            </div>
            {/* 액션 */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {u.status === 'pending' && (
                <>
                  <button onClick={() => { setModal({ user: u, action: 'approve' }); setSelectedSector(''); }} style={{
                    padding: '6px 10px', borderRadius: 7, border: 'none', display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'var(--accent)', color: '#fff',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}><Check size={13} /> 승인</button>
                  <button onClick={() => setModal({ user: u, action: 'reject' })} style={{
                    padding: '6px 10px', borderRadius: 7, border: '1px solid rgba(201,54,54,.3)', display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'var(--bg-card)', color: 'var(--negative)',
                    fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  }}><X size={13} /> 거절</button>
                </>
              )}
              {u.status === 'approved' && (
                <button onClick={() => setModal({ user: u, action: 'reject' })} style={{
                  padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
                  background: 'transparent', color: 'var(--mid)',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                }}>비활성화</button>
              )}
              {u.status === 'rejected' && (
                <button onClick={() => setModal({ user: u, action: 'approve' })} style={{
                  padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border-hover)',
                  background: 'var(--bg-card)', color: 'var(--accent)',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}>다시 승인</button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 승인/거절 모달 */}
      {modal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: 20,
        }} onClick={e => e.target === e.currentTarget && setModal(null)}>
          <div style={{
            background: 'var(--surface)', borderRadius: 12,
            padding: 28, width: '100%', maxWidth: 440,
            border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
          }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 6px' }}>
              {modal.action === 'approve' ? '가입 승인' : '가입 거절'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--mid)', marginBottom: 20 }}>
              <strong>{modal.user.name}</strong> ({modal.user.email})
            </p>

            {modal.action === 'approve' && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                  관리구역 배정 (선택 사항)
                </label>
                <select
                  value={selectedSector}
                  onChange={e => setSelectedSector(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px',
                    background: 'var(--bg-input)', border: '1px solid var(--border)',
                    borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
                    color: 'var(--text)',
                  }}
                >
                  <option value="">나중에 정하기 (엑셀을 올리면 자동 배정)</option>
                  {sectors.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 6 }}>
                메모 (선택 사항)
              </label>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                placeholder={modal.action === 'reject' ? '거절 사유 입력' : '승인 메모'}
                style={{
                  width: '100%', padding: '10px 12px', resize: 'none', height: 80,
                  background: 'var(--bg-input)', border: '1px solid var(--border)',
                  borderRadius: 8, fontSize: 13, fontFamily: 'inherit',
                  color: 'var(--text)', boxSizing: 'border-box',
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setModal(null)} style={{
                flex: 1, padding: '11px 0', borderRadius: 8,
                border: '1px solid var(--border)', background: 'transparent',
                color: 'var(--mid)', fontSize: 14, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}>취소</button>
              <button onClick={handleAction} disabled={processing} style={{
                flex: 1, padding: '11px 0', borderRadius: 8, border: 'none',
                background: modal.action === 'approve' ? 'var(--accent)' : 'var(--negative)',
                color: '#fff', fontSize: 14, fontWeight: 600,
                cursor: processing ? 'wait' : 'pointer', fontFamily: 'inherit',
              }}>
                {processing ? '처리하는 중' : modal.action === 'approve' ? '승인' : '거절'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
