'use client';
import { useState } from 'react';
import { useInspections } from '@/hooks/useInspections';
import type { InspectionType } from '@/types';

const TYPE_BADGE: Record<string, string> = {
  '월차': 'bg-[rgba(49,130,246,.12)] text-[#3182F6]',
  '분기': 'bg-[rgba(245,166,35,.12)] text-[#F5A623]',
  '반기': 'bg-[rgba(245,166,35,.12)] text-[#F5A623]',
  '연차': 'bg-[rgba(5,192,114,.12)] text-[#05C072]',
};

export default function HistoryPage() {
  const [typeFilter, setTypeFilter] = useState<InspectionType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [month, setMonth] = useState('');
  const { inspections, loading } = useInspections({ type: typeFilter === 'all' ? undefined : typeFilter });

  const filtered = inspections.filter(i => {
    const nameMatch = !search || (i.station as any)?.base_name?.includes(search);
    const monthMatch = !month || i.inspection_date.startsWith(month);
    return nameMatch && monthMatch;
  });

  return (
    <div className="p-6 md:p-8 max-w-[1100px]">
      <div className="mb-7">
        <h1 className="text-2xl font-[800] tracking-tight">점검 이력</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>생성된 직무고시 파일 목록</p>
      </div>
      <div className="flex flex-wrap gap-2 mb-5 items-center">
        {(['all','월차','분기','반기','연차'] as const).map(f => (
          <button key={f} onClick={() => setTypeFilter(f)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
            style={{ border:`1px solid ${typeFilter===f?'var(--accent)':'var(--border)'}`, background:typeFilter===f?'var(--accent)':'transparent', color:typeFilter===f?'#fff':'var(--text-secondary)' }}>
            {f === 'all' ? '전체' : f}
          </button>
        ))}
        <div className="ml-auto flex gap-2">
          <input className="toss-input !py-2 !w-[160px] text-sm" placeholder="충전소 검색" value={search} onChange={e=>setSearch(e.target.value)}/>
          <input type="month" className="toss-input !py-2 !w-[140px] text-sm" value={month} onChange={e=>setMonth(e.target.value)}/>
        </div>
      </div>
      <div className="toss-card !p-0 overflow-hidden overflow-x-auto">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr style={{ background:'var(--bg-elevated)' }}>
              {['충전소','점검유형','점검일자','점검자','파일명',''].map(h=>(
                <th key={h} className="text-left px-4 py-3 text-[11px] font-bold uppercase border-b" style={{color:'var(--text-secondary)',borderColor:'var(--border)'}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="py-8 text-center text-sm" style={{color:'var(--text-secondary)'}}>불러오는 중...</td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-sm" style={{color:'var(--text-secondary)'}}>이력이 없습니다</td></tr>}
            {filtered.map(ins=>(
              <tr key={ins.id} className="hover:bg-white/[.02] transition-colors">
                <td className="px-4 py-3.5 text-sm font-semibold border-b" style={{borderColor:'var(--border)'}}>{(ins.station as any)?.base_name}</td>
                <td className="px-4 py-3.5 border-b" style={{borderColor:'var(--border)'}}><span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${TYPE_BADGE[ins.inspection_type]}`}>{ins.inspection_type}</span></td>
                <td className="px-4 py-3.5 text-sm border-b" style={{borderColor:'var(--border)',color:'var(--text-secondary)'}}>{ins.inspection_date}</td>
                <td className="px-4 py-3.5 text-sm border-b" style={{borderColor:'var(--border)',color:'var(--text-secondary)'}}>{ins.inspector_name}</td>
                <td className="px-4 py-3.5 border-b" style={{borderColor:'var(--border)'}}><span className="text-xs" style={{color:'var(--text-secondary)'}}>{ins.file_name}</span></td>
                <td className="px-4 py-3.5 text-right border-b" style={{borderColor:'var(--border)'}}>
                  {ins.file_path && <a href={ins.file_path} download><button className="px-3 py-1.5 text-xs font-semibold rounded-[8px]" style={{background:'var(--bg-input)',border:'1px solid var(--border)',color:'var(--text-primary)'}}>⬇ 다운로드</button></a>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
