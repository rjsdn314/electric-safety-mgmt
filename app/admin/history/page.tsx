'use client';
// ============================================================
// app/admin/history/page.tsx — 전체 점검이력 조회 (관리자)
// ============================================================
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Inspection, InspectionType, Sector } from '@/types';

const TYPE_BADGE: Record<string, string> = {
  '월차': 'bg-[rgba(49,130,246,.12)] text-[#3182F6]',
  '분기': 'bg-[rgba(245,166,35,.12)] text-[#F5A623]',
  '반기': 'bg-[rgba(245,166,35,.12)] text-[#F5A623]',
  '연차': 'bg-[rgba(5,192,114,.12)] text-[#05C072]',
};

export default function AdminHistoryPage() {
  const [inspections, setInspections] = useState<(Inspection & { sector_name?: string })[]>([]);
  const [sectors, setSectors]   = useState<Sector[]>([]);
  const [loading, setLoading]   = useState(true);

  // 필터 상태
  const [sectorFilter, setSectorFilter]   = useState('all');
  const [typeFilter, setTypeFilter]       = useState<InspectionType | 'all'>('all');
  const [monthFilter, setMonthFilter]     = useState('');
  const [search, setSearch]               = useState('');
  const supabase = createClient();

  useEffect(() => {
    const fetchSectors = async () => {
      const { data } = await supabase.from('sectors').select('*').order('name');
      setSectors(data ?? []);
    };
    fetchSectors();
  }, []);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      let query = supabase
        .from('inspections')
        .select(`
          *,
          station:stations(id, name, base_name, sector_id, sector:sectors(name)),
          profile:profiles(name)
        `)
        .order('inspection_date', { ascending: false })
        .limit(200);

      if (typeFilter !== 'all') query = query.eq('inspection_type', typeFilter);
      if (monthFilter)          query = query.gte('inspection_date', `${monthFilter}-01`).lte('inspection_date', `${monthFilter}-31`);

      const { data } = await query;
      setInspections(data ?? []);
      setLoading(false);
    };
    fetchHistory();
  }, [typeFilter, monthFilter]);

  // 클라이언트 필터
  const filtered = inspections.filter(i => {
    const sectorMatch = sectorFilter === 'all' || (i.station as any)?.sector?.id === sectorFilter || (i.station as any)?.sector_id === sectorFilter;
    const nameMatch   = !search || (i.station as any)?.base_name?.includes(search);
    return sectorMatch && nameMatch;
  });

  // CSV 내보내기
  const exportCSV = () => {
    const headers = ['충전소', '점검유형', '점검일자', '점검자', '파일명', '섹터'];
    const rows = filtered.map(i => [
      (i.station as any)?.base_name ?? '',
      i.inspection_type,
      i.inspection_date,
      i.inspector_name,
      i.file_name ?? '',
      (i.station as any)?.sector?.name ?? '',
    ]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = '점검이력.csv'; a.click();
  };

  return (
    <div className="p-8 max-w-[1200px]">
      <div className="flex items-center justify-between mb-7">
        <div>
          <h1 className="text-2xl font-[800] tracking-tight">전체 점검이력</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            모든 섹터 · 총 {filtered.length}건
          </p>
        </div>
        <button
          className="px-4 py-2.5 rounded-[10px] text-sm font-bold transition-all hover:-translate-y-px"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          onClick={exportCSV}>
          📥 CSV 내보내기
        </button>
      </div>

      {/* 필터 */}
      <div className="flex flex-wrap gap-2 mb-5">
        <select className="toss-input toss-select !py-2 !w-[140px] text-sm" value={sectorFilter}
          onChange={e => setSectorFilter(e.target.value)}>
          <option value="all">전체 섹터</option>
          {sectors.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select className="toss-input toss-select !py-2 !w-[120px] text-sm" value={typeFilter}
          onChange={e => setTypeFilter(e.target.value as InspectionType | 'all')}>
          <option value="all">전체 유형</option>
          <option value="월차">월차</option>
          <option value="분기">분기</option>
          <option value="반기">반기</option>
          <option value="연차">연차</option>
        </select>
        <input type="month" className="toss-input !py-2 !w-[150px] text-sm"
          value={monthFilter} onChange={e => setMonthFilter(e.target.value)} />
        <input className="toss-input !py-2 !w-[180px] text-sm" placeholder="충전소명 검색"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {/* 테이블 */}
      <div className="toss-card !p-0 overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse min-w-[800px]">
          <thead>
            <tr style={{ background: 'var(--bg-elevated)' }}>
              {['충전소', '섹터', '점검유형', '점검일자', '점검자', '파일명', ''].map(h => (
                <th key={h} className="text-left px-4 py-3 text-[11px] font-bold uppercase tracking-[.05em] border-b"
                  style={{ color: 'var(--text-secondary)', borderColor: 'var(--border)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={7} className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>불러오는 중...</td></tr>
            )}
            {!loading && filtered.length === 0 && (
              <tr><td colSpan={7} className="py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>이력이 없습니다</td></tr>
            )}
            {filtered.map(ins => (
              <tr key={ins.id} className="hover:bg-white/[.02] transition-colors">
                <td className="px-4 py-3.5 text-sm font-semibold border-b" style={{ borderColor: 'var(--border)' }}>
                  {(ins.station as any)?.base_name}
                </td>
                <td className="px-4 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs px-2 py-0.5 rounded-md"
                    style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                    {(ins.station as any)?.sector?.name ?? '—'}
                  </span>
                </td>
                <td className="px-4 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${TYPE_BADGE[ins.inspection_type]}`}>
                    {ins.inspection_type}
                  </span>
                </td>
                <td className="px-4 py-3.5 text-sm border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {ins.inspection_date}
                </td>
                <td className="px-4 py-3.5 text-sm border-b" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  {ins.inspector_name}
                </td>
                <td className="px-4 py-3.5 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{ins.file_name}</span>
                </td>
                <td className="px-4 py-3.5 text-right border-b" style={{ borderColor: 'var(--border)' }}>
                  {ins.file_path && (
                    <a href={ins.file_path} download>
                      <button className="px-3 py-1.5 text-xs font-semibold rounded-[8px]"
                        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                        ⬇
                      </button>
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
