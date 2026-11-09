'use client';
// ============================================================
// app/(dashboard)/dashboard/page.tsx — 대시보드
// ============================================================
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { Plus, Download, ChevronRight, ChevronLeft } from 'lucide-react';

// ── 통계 카드 ──────────────────────────────────────
function StatCard({ label, value, unit, color }: { label: string; value: string | number; unit?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '16px 18px' }}>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <span style={{ fontSize: 26, fontWeight: 700, color: color || 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
        {unit && <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{unit}</span>}
      </div>
    </div>
  );
}

// ── 점검유형 배지 ────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  return (
    <span style={{
      fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
      background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)',
    }}>{type}</span>
  );
}

// ── 페이지 본문 ──────────────────────────────────────────────
export default function DashboardPage() {
  const { profile } = useAuth();
  // 사용자별 대시보드: 본인이 등록한 관리구역(충전소) 기준. 관리자는 본인 + 소유자 없는(레거시) 포함.
  const [stations, setStations] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  // 관리자 보기 대상: 'mine'(내 관리구역=본인+미지정) | 회원 id | 'all'(전체)
  const [viewOwner, setViewOwner] = useState<string>('mine');
  // 보는 달 (기본: 이번 달). 이전 달 점검도 넘겨 볼 수 있다
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() + 1 });
  const isThisMonth = ym.y === today.getFullYear() && ym.m === today.getMonth() + 1;
  const shiftMonth = (d: number) => setYm(({ y, m }) => { const t = new Date(y, m - 1 + d, 1); return { y: t.getFullYear(), m: t.getMonth() + 1 }; });

  // 최초: 권한 확인 + 회원 목록(사이트를 가진 다른 회원) 로드
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      setMeId(user.id);
      const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).single();
      const admin = prof?.role === 'admin';
      setIsAdmin(admin);
      if (admin) {
        const { data: owners } = await sb.from('stations').select('user_id').not('user_id', 'is', null);
        const ownerIds = [...new Set((owners || []).map((o: any) => o.user_id))].filter(id => id !== user.id);
        if (ownerIds.length) {
          const { data: profs } = await sb.from('profiles').select('id, name').in('id', ownerIds);
          setMembers((profs || []).map((p: any) => ({ id: p.id, name: p.name || '이름없음' })));
        }
      }
    })();
  }, []);

  // 보기 대상이 정해지면 충전소+이력 로드
  useEffect(() => {
    if (!meId) return;
    (async () => {
      const sb = createClient();
      let sq = sb.from('stations').select('*').eq('is_active', true).order('name');
      if (!isAdmin) sq = sq.eq('user_id', meId);
      else if (viewOwner === 'mine') sq = sq.or(`user_id.eq.${meId},user_id.is.null`);
      else if (viewOwner !== 'all') sq = sq.eq('user_id', viewOwner);
      // viewOwner==='all'이면 필터 없음(전체)
      const { data: sts } = await sq;
      const list = sts || [];
      setStations(list);
      const ids = list.map((s: any) => s.id);
      if (ids.length) {
        // 고른 달의 점검만 불러온다 (YYYY-MM-01 이상, 다음 달 1일 미만)
        const pad = (n: number) => String(n).padStart(2, '0');
        const next = new Date(ym.y, ym.m, 1);
        const from = `${ym.y}-${pad(ym.m)}-01`;
        const to = `${next.getFullYear()}-${pad(next.getMonth() + 1)}-01`;
        const { data: insps } = await sb.from('inspections').select('*')
          .in('station_id', ids).gte('inspection_date', from).lt('inspection_date', to)
          .order('inspection_date', { ascending: false }).limit(1000);
        const stMap = new Map(list.map((s: any) => [s.id, s]));
        setInspections((insps || []).map((i: any) => ({ ...i, station: stMap.get(i.station_id) })));
      } else { setInspections([]); }
    })();
  }, [meId, isAdmin, viewOwner, ym.y, ym.m]);

  const currentMonth = ym.m;
  const currentYear  = ym.y;

  const thisMonthDone = inspections.filter(i => {
    const d = new Date(i.inspection_date);
    return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
  }).length;

  // 이번달 점검 완료한 충전소 id 집합
  const doneStationIds = new Set(
    inspections
      .filter(i => {
        const d = new Date(i.inspection_date);
        return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
      })
      .map(i => i.station_id)
  );
  // 이번달 아직 점검하지 않은 개소 목록
  const pendingStations = stations.filter(st => !doneStationIds.has(st.id)); const [pendingShow, setPendingShow] = useState(10); const visiblePending = pendingStations.slice(0, pendingShow);


  const cardBox: React.CSSProperties = {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '18px 20px',
  };
  const cardTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' };
  const stationRow: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8,
    border: '1px solid var(--border)', background: 'var(--bg-card)', textDecoration: 'none',
  };
  const ownerLabel = viewOwner === 'mine' ? '내 관리구역' : viewOwner === 'all' ? '전체 회원' : `${members.find(m => m.id === viewOwner)?.name} 관리구역`;

  return (
    <div className="dash" style={{ padding: '28px 32px 60px', maxWidth: 960 }}>

      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: '0 0 4px' }}>대시보드</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, color: 'var(--text-secondary)' }}>
            <button onClick={() => shiftMonth(-1)} aria-label="이전 달" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={16} /></button>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)', minWidth: 92, textAlign: 'center' }}>{currentYear}년 {currentMonth}월</span>
            <button onClick={() => shiftMonth(1)} disabled={isThisMonth} aria-label="다음 달" style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: isThisMonth ? 'default' : 'pointer', opacity: isThisMonth ? 0.4 : 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={16} /></button>
            {!isThisMonth && <button onClick={() => setYm({ y: today.getFullYear(), m: today.getMonth() + 1 })} style={{ border: 'none', background: 'none', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>이번 달</button>}
            <span style={{ marginLeft: 4 }}>{ownerLabel}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
            <select value={viewOwner} onChange={e => setViewOwner(e.target.value)}
              style={{ padding: '8px 10px', borderRadius: 8, fontSize: 13, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-primary)', cursor: 'pointer' }}>
              <option value="mine">내 관리구역</option>
              {members.map(m => (<option key={m.id} value={m.id}>{m.name} 관리구역</option>))}
              <option value="all">전체 회원</option>
            </select>
          )}
          <Link href="/inspection" className="btn-primary" style={{ textDecoration: 'none', padding: '9px 16px', fontSize: 14 }}>
            <Plus size={16} /> 점검 생성
          </Link>
        </div>
      </div>

      {/* 통계 */}
      <div className="dash-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="관리 충전소" value={stations.length} unit="개소" />
        <StatCard label={`${currentMonth}월 점검`} value={thisMonthDone} unit="건" />
        <StatCard label={`${currentMonth}월 미점검`} value={pendingStations.length} unit="개소" color={pendingStations.length ? 'var(--warning)' : undefined} />
        <StatCard label="총 수전용량" value={(stations.reduce((s, st) => s + (st.capacity ?? 0), 0) / 1000).toFixed(1)} unit="MW" />
      </div>

      {/* 이번달 미점검 개소 */}
      <div style={{ ...cardBox, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
          <span style={cardTitle}>{currentMonth}월 미점검</span>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{pendingStations.length}개소</span>
        </div>
        {pendingStations.length === 0 ? (
          <p style={{ padding: '20px 0', margin: 0, textAlign: 'center', fontSize: 14, color: 'var(--text-tertiary)' }}>
            {currentMonth}월 점검을 모두 마쳤습니다.</p>
        ) : (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {visiblePending.map(station => (
              <Link key={station.id} href="/inspection" className="dash-row" style={stationRow}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--warning)', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {station.base_name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>
                    {station.capacity}kW, {station.voltage}V
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {pendingShow < pendingStations.length && (
            <button onClick={() => setPendingShow(n => n + 10)} style={{ width: '100%', marginTop: 10, padding: '9px 0', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>
              {pendingStations.length - pendingShow}개 더 보기
            </button>
          )}
        </>)}
      </div>

      {/* 최근 점검 + 충전소 현황 */}
      <div className="dash-cols" style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 12, alignItems: 'start' }}>

        <div style={cardBox}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={cardTitle}>{currentMonth}월 점검 {inspections.length ? `${inspections.length}건` : ''}</span>
            <Link href="/history" style={{ fontSize: 13, color: 'var(--accent)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
              전체 이력 <ChevronRight size={14} />
            </Link>
          </div>
          <div>
            {inspections.length === 0 && (
              <p style={{ padding: '28px 0', margin: 0, textAlign: 'center', fontSize: 14, color: 'var(--text-tertiary)' }}>{currentMonth}월 점검 기록이 없습니다.</p>
            )}
            {inspections.slice(0, 30).map(ins => (
              <div key={ins.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: '1px solid var(--border)' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ins.station?.base_name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>
                    {ins.inspection_date}, {ins.inspector_name}
                  </div>
                </div>
                <TypeBadge type={ins.inspection_type} />
                {ins.file_path && (
                  <a href={ins.file_path} download title="엑셀 내려받기" className="dash-icon-btn" style={{
                    width: 30, height: 30, borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: '1px solid var(--border)', color: 'var(--text-secondary)', textDecoration: 'none',
                  }}><Download size={15} /></a>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={cardBox}>
          <div style={{ ...cardTitle, marginBottom: 12 }}>충전소 점검 현황</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {stations.slice(0, 6).map(station => {
              const done = inspections.some(i => i.station_id === station.id);
              return (
                <div key={station.id} style={{ ...stationRow, cursor: 'default' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {station.base_name}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>
                      {station.capacity}kW, {station.voltage}V
                    </div>
                  </div>
                  <span style={{
                    fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 6,
                    background: done ? 'var(--positive-soft)' : 'var(--warning-soft)',
                    color: done ? 'var(--positive)' : 'var(--warning)',
                  }}>{done ? '완료' : '미점검'}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style>{`
        .dash-row:hover { border-color: var(--border-hover) !important; background: var(--bg-elevated) !important; }
        .dash-icon-btn:hover { color: var(--accent) !important; border-color: var(--accent) !important; }
        @media (max-width: 900px) {
          .dash { padding: 20px 16px 60px !important; }
          .dash-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .dash-cols { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}
