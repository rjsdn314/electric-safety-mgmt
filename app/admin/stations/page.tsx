'use client';
// ============================================================
// app/admin/stations/page.tsx — 충전소 관리
// ============================================================
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Station, Sector } from '@/types';
import { groupStations } from '@/lib/utils/station-group';

// 모달 공통 컴포넌트
function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 overflow-y-auto"
      style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}
      onClick={onClose}>
      <div className="w-full max-w-[500px] my-8 rounded-[20px] p-6"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-[800] mb-5">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// 빈 충전소 폼 기본값
const emptyStation = (): Partial<Station> => ({
  name: '', address: '', management_type: '',
  voltage: 22900, capacity: 0,
  equipment_info: {}, custom_values: {},
  is_active: true,
});

export default function StationsPage() {
  const [stations, setStations]   = useState<Station[]>([]);
  const [sectors, setSectors]     = useState<Sector[]>([]);
  const [editing, setEditing]     = useState<Partial<Station> | null>(null);
  const [isNew, setIsNew]         = useState(false);
  const [saving, setSaving]       = useState(false);
  const [search, setSearch]       = useState('');
  const [sectorFilter, setSectorFilter] = useState('all');
  const supabase = createClient();

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    const [{ data: st }, { data: se }] = await Promise.all([
      supabase.from('stations').select('*').order('base_name'),
      supabase.from('sectors').select('*').order('name'),
    ]);
    setStations(st ?? []);
    setSectors(se ?? []);
  };

  // 필터링
  const filtered = stations.filter(s => {
    const nameMatch = !search || s.name.includes(search) || s.base_name.includes(search);
    const sectorMatch = sectorFilter === 'all' || s.sector_id === sectorFilter;
    return nameMatch && sectorMatch;
  });
  const groups = groupStations(filtered);

  const openNew = () => { setEditing(emptyStation()); setIsNew(true); };
  const openEdit = (s: Station) => { setEditing({ ...s }); setIsNew(false); };

  const handleSave = async () => {
    if (!editing?.name || !editing.sector_id) return alert('충전소명과 섹터를 입력해주세요');
    setSaving(true);

    if (isNew) {
      await supabase.from('stations').insert({
        ...editing,
        base_name: editing.name!.replace(/-\d+$/, ''), // DB 트리거가 처리하지만 명시적으로도 설정
      });
    } else {
      await supabase.from('stations').update({
        name: editing.name, address: editing.address,
        management_type: editing.management_type, voltage: editing.voltage,
        capacity: editing.capacity, sector_id: editing.sector_id,
        equipment_info: editing.equipment_info, custom_values: editing.custom_values,
        is_active: editing.is_active, updated_at: new Date().toISOString(),
      }).eq('id', editing.id!);
    }

    setSaving(false);
    setEditing(null);
    fetchAll();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까? (비활성화 처리됩니다)')) return;
    await supabase.from('stations').update({ is_active: false }).eq('id', id);
    fetchAll();
  };

  return (
    <div className="p-8 max-w-[1100px]">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-2xl font-[800] tracking-tight">충전소 관리</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            총 {stations.length}개 충전소 · {groups.length}개 그룹
          </p>
        </div>
        <button
          className="px-4 py-2.5 rounded-[10px] text-sm font-bold text-white transition-all hover:-translate-y-px"
          style={{ background: 'var(--accent)' }}
          onClick={openNew}>
          + 충전소 추가
        </button>
      </div>

      {/* 필터 */}
      <div className="flex gap-2 mb-5 flex-wrap">
        <input className="toss-input !py-2 !w-[200px] text-sm" placeholder="충전소명 검색"
          value={search} onChange={e => setSearch(e.target.value)} />
        <select className="toss-input toss-select !py-2 !w-[160px] text-sm" value={sectorFilter}
          onChange={e => setSectorFilter(e.target.value)}>
          <option value="all">전체 섹터</option>
          {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      {/* 그룹별 카드 */}
      <div className="space-y-4">
        {groups.map(group => {
          const groupStns = filtered.filter(s => s.base_name === group.base_name);
          const sector = sectors.find(s => groupStns[0]?.sector_id === s.id);

          return (
            <div key={group.base_name} className="toss-card !p-0 overflow-hidden">
              {/* 그룹 헤더 */}
              <div className="flex items-center gap-3 px-5 py-4 border-b"
                style={{ background: 'var(--bg-elevated)', borderColor: 'var(--border)' }}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold">{group.base_name}</span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded-md"
                      style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
                      {group.unit_count}대
                    </span>
                    {sector && (
                      <span className="text-[11px] px-2 py-0.5 rounded-md"
                        style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                        {sector.name}
                      </span>
                    )}
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    합산 용량: <strong style={{ color: 'var(--accent)' }}>{group.total_capacity}kW</strong>
                    &nbsp;·&nbsp; 수전전압: {group.voltage}V
                  </div>
                </div>
              </div>

              {/* 하위 충전기 목록 */}
              {groupStns.map((s, i) => (
                <div key={s.id} className={`flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-white/[.02]
                  ${i < groupStns.length - 1 ? 'border-b' : ''}`}
                  style={{ borderColor: 'var(--border)' }}>
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.is_active ? 'bg-[#05C072] shadow-[0_0_5px_#05C072]' : 'bg-[#48484A]'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold">{s.name}</div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {s.address || '주소 없음'} · {s.management_type || '—'} · {s.capacity}kW
                    </div>
                  </div>
                  {!s.is_active && (
                    <span className="text-[11px] px-2 py-0.5 rounded-md" style={{ background: 'rgba(72,72,74,.3)', color: 'var(--text-tertiary)' }}>
                      비활성
                    </span>
                  )}
                  <div className="flex gap-1.5">
                    <button
                      className="px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-colors"
                      style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                      onClick={() => openEdit(s)}>
                      수정
                    </button>
                    <button
                      className="px-3 py-1.5 text-xs font-semibold rounded-[8px] transition-colors"
                      style={{ background: 'rgba(240,68,82,.08)', border: '1px solid rgba(240,68,82,.2)', color: '#F04452' }}
                      onClick={() => handleDelete(s.id)}>
                      삭제
                    </button>
                  </div>
                </div>
              ))}
            </div>
          );
        })}

        {groups.length === 0 && (
          <div className="py-16 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
            검색 결과가 없습니다
          </div>
        )}
      </div>

      {/* ── 추가/수정 모달 ── */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={isNew ? '충전소 추가' : '충전소 수정'}>
        {editing && (
          <>
            <div className="space-y-3 mb-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1.5">충전소명 *</label>
                  <input className="toss-input" placeholder="장유휴게소-01"
                    value={editing.name ?? ''} onChange={e => setEditing({ ...editing, name: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">섹터 *</label>
                  <select className="toss-input toss-select" value={editing.sector_id ?? ''}
                    onChange={e => setEditing({ ...editing, sector_id: e.target.value })}>
                    <option value="">섹터 선택</option>
                    {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold mb-1.5">주소</label>
                <input className="toss-input" placeholder="경남 김해시 장유면..."
                  value={editing.address ?? ''} onChange={e => setEditing({ ...editing, address: e.target.value })} />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1.5">수전전압 (V)</label>
                  <input className="toss-input" type="number" placeholder="22900"
                    value={editing.voltage ?? ''} onChange={e => setEditing({ ...editing, voltage: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">수전용량 (kW)</label>
                  <input className="toss-input" type="number" placeholder="200"
                    value={editing.capacity ?? ''} onChange={e => setEditing({ ...editing, capacity: Number(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1.5">관리구분</label>
                  <input className="toss-input" placeholder="직접관리"
                    value={editing.management_type ?? ''} onChange={e => setEditing({ ...editing, management_type: e.target.value })} />
                </div>
              </div>

              {/* 고정값 (custom_values) */}
              <div>
                <label className="block text-sm font-semibold mb-1.5">충전소 고정값 (JSON)</label>
                <textarea className="toss-input font-mono text-xs resize-none" rows={3}
                  placeholder='{"계통전압": "22900", "변압기용량": "500"}'
                  value={JSON.stringify(editing.custom_values ?? {}, null, 2)}
                  onChange={e => {
                    try { setEditing({ ...editing, custom_values: JSON.parse(e.target.value) }); }
                    catch { /* JSON 파싱 오류 무시 */ }
                  }} />
                <p className="text-[11px] mt-1" style={{ color: 'var(--text-secondary)' }}>
                  충전소별 고정값을 JSON 형식으로 입력 (하드코딩 방지)
                </p>
              </div>
            </div>

            <div className="flex gap-2">
              <button className="toss-btn-primary flex-1" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : isNew ? '추가' : '저장'}
              </button>
              <button className="flex-1 py-3.5 rounded-[10px] text-sm font-bold"
                style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
                onClick={() => setEditing(null)}>
                취소
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
