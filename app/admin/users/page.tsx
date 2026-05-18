'use client';
// ============================================================
// app/admin/users/page.tsx — 사용자 관리
// ============================================================
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Profile, Sector, UserRole } from '@/types';

// ── 인라인 모달 컴포넌트 ──────────────────────────────────
function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-[440px] rounded-[20px] p-6"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

// ── 역할 배지 ─────────────────────────────────────────────
function RoleBadge({ role }: { role: UserRole }) {
  return role === 'admin'
    ? <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'rgba(240,68,82,.12)', color: '#F04452' }}>관리자</span>
    : <span className="text-[11px] font-bold px-2 py-0.5 rounded-md" style={{ background: 'rgba(49,130,246,.12)', color: '#3182F6' }}>사용자</span>;
}

export default function UsersPage() {
  const [users, setUsers]     = useState<Profile[]>([]);
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [saving, setSaving]   = useState(false);

  // 초대 폼 상태
  const [invite, setInvite] = useState({ email: '', name: '', sector_id: '', role: 'user' as UserRole });

  const supabase = createClient();

  useEffect(() => {
    fetchAll();
  }, []);

  const fetchAll = async () => {
    const [{ data: u }, { data: s }] = await Promise.all([
      supabase.from('profiles').select('*, sector:sectors(*)').order('created_at', { ascending: false }),
      supabase.from('sectors').select('*').order('name'),
    ]);
    setUsers(u ?? []);
    setSectors(s ?? []);
  };

  // 사용자 정보 수정 저장
  const handleSave = async () => {
    if (!editing) return;
    setSaving(true);
    await supabase.from('profiles').update({
      name: editing.name,
      role: editing.role,
      sector_id: editing.sector_id,
      updated_at: new Date().toISOString(),
    }).eq('id', editing.id);
    setSaving(false);
    setEditing(null);
    fetchAll();
  };

  // 사용자 초대 (Supabase Admin API → 실제 구현 시 서버 API Route 사용)
  const handleInvite = async () => {
    setSaving(true);
    const res = await fetch('/api/admin/invite-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invite),
    });
    if (res.ok) {
      setInviteOpen(false);
      setInvite({ email: '', name: '', sector_id: '', role: 'user' });
      fetchAll();
    } else {
      alert('초대 중 오류가 발생했습니다');
    }
    setSaving(false);
  };

  return (
    <div className="p-8 max-w-[1000px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-2xl font-[800] tracking-tight">사용자 관리</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>계정 관리 및 섹터 배정</p>
        </div>
        <button
          className="px-4 py-2.5 rounded-[10px] text-sm font-bold text-white transition-all hover:-translate-y-px"
          style={{ background: 'var(--accent)' }}
          onClick={() => setInviteOpen(true)}>
          + 사용자 초대
        </button>
      </div>

      {/* 사용자 테이블 */}
      <div className="toss-card !p-0 overflow-hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr style={{ background: 'var(--bg-elevated)' }}>
              {['이름', '이메일', '섹터', '역할', '가입일', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-[.05em] border-b"
                  style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="hover:bg-white/[.02] transition-colors">
                <td className="px-4 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ background: 'linear-gradient(135deg, #3182F6, #6C5CE7)' }}>
                      {u.name?.[0] ?? '?'}
                    </div>
                    <span className="text-sm font-semibold">{u.name || '—'}</span>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-sm border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>{u.email}</td>
                <td className="px-4 py-3.5 text-sm border-b" style={{ borderColor: 'var(--border)' }}>
                  {u.sector?.name
                    ? <span className="px-2 py-0.5 rounded-md text-[11px] font-semibold" style={{ background: 'var(--bg-input)', color: 'var(--text-primary)' }}>{u.sector.name}</span>
                    : <span style={{ color: 'var(--text-tertiary)' }}>미배정</span>
                  }
                </td>
                <td className="px-4 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-4 py-3.5 text-xs border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {new Date(u.created_at).toLocaleDateString('ko-KR')}
                </td>
                <td className="px-4 py-3.5 text-right border-b" style={{ borderColor: 'var(--border)' }}>
                  <button
                    className="px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-colors"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                    onClick={() => setEditing(u)}>
                    수정
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── 수정 모달 ── */}
      <Modal open={!!editing} onClose={() => setEditing(null)}>
        {editing && (
          <>
            <h2 className="text-lg font-[800] mb-5">사용자 수정</h2>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-sm font-semibold mb-1.5">이름</label>
                <input className="toss-input" value={editing.name ?? ''}
                  onChange={e => setEditing({ ...editing, name: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5">섹터 배정</label>
                <select className="toss-input toss-select" value={editing.sector_id ?? ''}
                  onChange={e => setEditing({ ...editing, sector_id: e.target.value })}>
                  <option value="">섹터 없음</option>
                  {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold mb-1.5">역할</label>
                <select className="toss-input toss-select" value={editing.role}
                  onChange={e => setEditing({ ...editing, role: e.target.value as UserRole })}>
                  <option value="user">사용자</option>
                  <option value="admin">관리자</option>
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="toss-btn-primary flex-1" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : '저장'}
              </button>
              <button className="flex-1 py-3.5 rounded-[10px] text-sm font-bold transition-colors"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                onClick={() => setEditing(null)}>
                취소
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* ── 초대 모달 ── */}
      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)}>
        <h2 className="text-lg font-[800] mb-5">사용자 초대</h2>
        <div className="space-y-3 mb-5">
          <div>
            <label className="block text-sm font-semibold mb-1.5">이메일 *</label>
            <input className="toss-input" type="email" placeholder="example@company.com"
              value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">이름 *</label>
            <input className="toss-input" placeholder="점검자 이름"
              value={invite.name} onChange={e => setInvite({ ...invite, name: e.target.value })} />
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">섹터 배정</label>
            <select className="toss-input toss-select" value={invite.sector_id}
              onChange={e => setInvite({ ...invite, sector_id: e.target.value })}>
              <option value="">섹터 없음</option>
              {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold mb-1.5">역할</label>
            <select className="toss-input toss-select" value={invite.role}
              onChange={e => setInvite({ ...invite, role: e.target.value as UserRole })}>
              <option value="user">사용자</option>
              <option value="admin">관리자</option>
            </select>
          </div>
        </div>
        <div className="p-3 rounded-[8px] mb-4 text-xs" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          💡 초대 이메일이 발송되며 사용자가 비밀번호를 직접 설정합니다
        </div>
        <div className="flex gap-2">
          <button className="toss-btn-primary flex-1" onClick={handleInvite}
            disabled={saving || !invite.email || !invite.name}>
            {saving ? '초대 중...' : '초대 발송'}
          </button>
          <button className="flex-1 py-3.5 rounded-[10px] text-sm font-bold"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
            onClick={() => setInviteOpen(false)}>
            취소
          </button>
        </div>
      </Modal>
    </div>
  );
}
