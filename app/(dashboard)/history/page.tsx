'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const TYPES = ['전체', '월차', '분기', '반기', '연차'];

export default function HistoryPage() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('전체');
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    const sb = createClient();
    
    let q = sb.from('inspections')
      .select('*')
      .order('inspection_date', { ascending: false })
      .limit(100);
    if (filterType !== '전체') q = q.eq('inspection_type', filterType);
    
    const { data: insps, error } = await q;
    if (error) {
      console.error('점검 조회 오류:', error);
      setLoading(false);
      return;
    }

    if (insps && insps.length > 0) {
      const stationIds = [...new Set(insps.map(i => i.station_id))];
      const { data: stations } = await sb
        .from('stations')
        .select('id, base_name, name, voltage, capacity')
        .in('id', stationIds);
      
      const stationMap = new Map(stations?.map(s => [s.id, s]) || []);
      const merged = insps.map(i => ({
        ...i,
        station: stationMap.get(i.station_id)
      }));
      setItems(merged);
    } else {
      setItems([]);
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [filterType]);

  const handleDelete = async (item: any) => {
    if (!confirm(`정말 삭제하시겠습니까?\n\n${item.file_name}\n\n이 작업은 되돌릴 수 없습니다.`)) return;
    
    const sb = createClient();
    
    // Storage에서도 삭제 (file_path에서 경로 추출)
    if (item.file_path) {
      try {
        const url = new URL(item.file_path);
        const pathMatch = url.pathname.match(/\/inspections\/(.+)$/);
        if (pathMatch) {
          await sb.storage.from('inspections').remove([pathMatch[1]]);
        }
      } catch (e) { console.error('스토리지 삭제 실패:', e); }
    }
    
    // DB에서 삭제
    const { error } = await sb.from('inspections').delete().eq('id', item.id);
    if (error) {
      alert('삭제 실패: ' + error.message);
      return;
    }
    
    alert('삭제되었습니다');
    loadData();
  };

  const filtered = items.filter(i =>
    !search || i.station?.name?.includes(search) || i.station?.base_name?.includes(search)
  );

  return (
    <div>
      <h1 style={{fontSize: 24, fontWeight: 800, marginBottom: 8}}>점검 이력</h1>
      <p style={{color: 'var(--text-secondary)', marginBottom: 24}}>생성된 직무고시 파일 목록</p>

      <div style={{display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap'}}>
        {TYPES.map(t => (
          <button key={t} onClick={() => setFilterType(t)}
            style={{
              padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600,
              border: `1px solid ${filterType === t ? 'var(--accent)' : 'var(--border)'}`,
              background: filterType === t ? 'var(--accent-soft)' : 'transparent',
              color: filterType === t ? 'var(--accent)' : 'var(--text-secondary)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>{t}</button>
        ))}
        <input className="toss-input" placeholder="충전소 검색"
          value={search} onChange={e => setSearch(e.target.value)}
          style={{flex: 1, minWidth: 200, marginLeft: 'auto'}}/>
      </div>

      <div className="toss-card" style={{padding: 0, overflow: 'hidden'}}>
        <div style={{display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr 100px', gap: 12, padding: '16px 20px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)'}}>
          <div>충전소</div><div>점검유형</div><div>점검일자</div><div>점검자</div><div>파일명</div><div style={{textAlign: 'center'}}>액션</div>
        </div>

        {loading ? (
          <div style={{padding: 40, textAlign: 'center', color: 'var(--text-secondary)'}}>로딩 중...</div>
        ) : filtered.length === 0 ? (
          <div style={{padding: 40, textAlign: 'center', color: 'var(--text-secondary)'}}>이력이 없습니다</div>
        ) : (
          filtered.map(item => (
            <div key={item.id} style={{display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 2fr 100px', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center'}}>
              <div style={{fontWeight: 600}}>{item.station?.name || '-'}</div>
              <div><span style={{padding: '2px 8px', borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 11, fontWeight: 700}}>{item.inspection_type}</span></div>
              <div>{item.inspection_date}</div>
              <div>{item.inspector_name}</div>
              <div style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)'}}>{item.file_name}</div>
              <div style={{display: 'flex', gap: 6, justifyContent: 'center'}}>
                {item.file_path && (
                  <a href={item.file_path} download={item.file_name} title="다운로드" style={{
                    padding: 6, borderRadius: 6, background: 'var(--accent-soft)', color: 'var(--accent)',
                    textDecoration: 'none', fontSize: 14, lineHeight: 1
                  }}>⬇️</a>
                )}
                <button onClick={() => handleDelete(item)} title="삭제" style={{
                  padding: 6, borderRadius: 6, background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                  border: 'none', cursor: 'pointer', fontSize: 14, lineHeight: 1
                }}>🗑️</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}