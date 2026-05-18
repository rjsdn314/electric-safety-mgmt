'use client';
// ============================================================
// app/admin/settings/page.tsx — 시스템 설정 관리
// 하드코딩 없이 DB에서 전역 설정값 수정
// ============================================================
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Setting } from '@/types';

export default function SettingsPage() {
  const [settings, setSettings] = useState<Setting[]>([]);
  const [edited, setEdited]     = useState<Record<string, string>>({});
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const supabase = createClient();

  useEffect(() => {
    const fetch = async () => {
      const { data } = await supabase.from('settings').select('*').order('key');
      setSettings(data ?? []);
      // edited 초기화
      const init: Record<string, string> = {};
      (data ?? []).forEach(s => { init[s.key] = s.value; });
      setEdited(init);
    };
    fetch();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    // 변경된 항목만 upsert
    const updates = settings
      .filter(s => edited[s.key] !== s.value)
      .map(s => ({ key: s.key, value: edited[s.key], label: s.label, updated_at: new Date().toISOString() }));

    if (updates.length > 0) {
      await supabase.from('settings').upsert(updates, { onConflict: 'key' });
    }

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // 갱신
    const { data } = await supabase.from('settings').select('*').order('key');
    setSettings(data ?? []);
  };

  const hasChanges = settings.some(s => edited[s.key] !== s.value);

  return (
    <div className="p-8 max-w-[700px]">
      <div className="mb-7">
        <h1 className="text-2xl font-[800] tracking-tight">시스템 설정</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          전역 고정값 — 모든 충전소에 공통 적용됩니다
        </p>
      </div>

      {/* 안내 배너 */}
      <div className="p-4 rounded-[12px] mb-6 flex gap-3"
        style={{ background: 'var(--accent-soft)', border: '1px solid rgba(49,130,246,.2)' }}>
        <span className="text-lg flex-shrink-0">💡</span>
        <div className="text-sm" style={{ color: 'var(--accent)' }}>
          <strong>하드코딩 없는 구조</strong> — 아래 값들은 엑셀 생성 시 자동으로 반영됩니다.
          충전소별 개별 값은 충전소 관리에서 <code>custom_values</code>로 설정하세요.
        </div>
      </div>

      {/* 설정 목록 */}
      <div className="toss-card space-y-4">
        {settings.map(s => (
          <div key={s.key}>
            <label className="block text-sm font-semibold mb-1.5">{s.label}</label>
            <div className="flex gap-2 items-center">
              <input
                className="toss-input flex-1"
                value={edited[s.key] ?? ''}
                onChange={e => setEdited(prev => ({ ...prev, [s.key]: e.target.value }))}
              />
              {edited[s.key] !== s.value && (
                <span className="text-xs flex-shrink-0 px-2 py-1 rounded-md"
                  style={{ background: 'rgba(245,166,35,.12)', color: '#F5A623' }}>
                  변경됨
                </span>
              )}
            </div>
            <div className="text-[11px] mt-1 font-mono" style={{ color: 'var(--text-tertiary)' }}>
              key: {s.key}
            </div>
          </div>
        ))}
      </div>

      {/* 섹터 관리 섹션 */}
      <SectorManager />

      {/* 저장 버튼 */}
      <div className="mt-6">
        <button
          className="toss-btn-primary"
          onClick={handleSave}
          disabled={saving || !hasChanges}
          style={{ opacity: !hasChanges ? 0.5 : 1 }}>
          {saving ? '저장 중...' : saved ? '✓ 저장완료' : '변경사항 저장'}
        </button>
      </div>
    </div>
  );
}

// ── 섹터 관리 인라인 컴포넌트 ─────────────────────────────
function SectorManager() {
  const [sectors, setSectors] = useState<{ id: string; name: string }[]>([]);
  const [newName, setNewName] = useState('');
  const supabase = createClient();

  useEffect(() => {
    supabase.from('sectors').select('*').order('name').then(({ data }) => setSectors(data ?? []));
  }, []);

  const addSector = async () => {
    if (!newName.trim()) return;
    await supabase.from('sectors').insert({ name: newName.trim() });
    setNewName('');
    const { data } = await supabase.from('sectors').select('*').order('name');
    setSectors(data ?? []);
  };

  const deleteSector = async (id: string) => {
    if (!confirm('섹터를 삭제하면 배정된 사용자의 섹터가 해제됩니다. 계속하시겠습니까?')) return;
    await supabase.from('sectors').delete().eq('id', id);
    const { data } = await supabase.from('sectors').select('*').order('name');
    setSectors(data ?? []);
  };

  return (
    <div className="mt-8">
      <h2 className="text-base font-bold mb-4">섹터 관리</h2>
      <div className="toss-card space-y-2">
        {sectors.map(s => (
          <div key={s.id} className="flex items-center justify-between py-2">
            <span className="text-sm font-medium">{s.name}</span>
            <button
              className="px-2.5 py-1 text-xs font-semibold rounded-[6px]"
              style={{ background: 'rgba(240,68,82,.08)', color: '#F04452' }}
              onClick={() => deleteSector(s.id)}>
              삭제
            </button>
          </div>
        ))}
        <div className="flex gap-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <input className="toss-input flex-1 !py-2 text-sm" placeholder="새 섹터명 (예: 수도권)"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addSector()} />
          <button className="px-4 py-2 rounded-[8px] text-sm font-bold text-white"
            style={{ background: 'var(--accent)' }} onClick={addSector}>
            추가
          </button>
        </div>
      </div>
    </div>
  );
}
