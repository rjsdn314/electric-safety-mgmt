'use client';
// ============================================================
// app/(dashboard)/dashboard/page.tsx
// ============================================================
import { useStations } from '@/hooks/useStations';
import { useInspections } from '@/hooks/useInspections';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

// 통계 카드 컴포넌트
function StatCard({ label, value, sub, color }: {
  label: string; value: string | number;
  sub?: string; color?: 'blue' | 'green' | 'yellow';
}) {
  const colorMap = { blue: '#3182F6', green: '#05C072', yellow: '#F5A623' };
  return (
    <div className="rounded-[16px] p-5 transition-all hover:-translate-y-px cursor-default"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 0 24px rgba(49,130,246,.12)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      <div className="text-xs font-medium mb-2.5" style={{ color: 'var(--text-secondary)' }}>{label}</div>
      <div className="text-[28px] font-[800] tracking-tight"
        style={{ color: color ? colorMap[color] : 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && <div className="text-[11px] mt-1.5" style={{ color: 'var(--text-secondary)' }}>{sub}</div>}
    </div>
  );
}

// 점검유형 배지
function TypeBadge({ type }: { type: string }) {
  const styles: Record<string, string> = {
    '월차': 'bg-[rgba(49,130,246,.12)] text-[#3182F6]',
    '분기': 'bg-[rgba(245,166,35,.12)] text-[#F5A623]',
    '반기': 'bg-[rgba(245,166,35,.12)] text-[#F5A623]',
    '연차': 'bg-[rgba(5,192,114,.12)] text-[#05C072]',
  };
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${styles[type] ?? ''}`}>
      {type}
    </span>
  );
}

export default function DashboardPage() {
  const { profile } = useAuth();
  const { stations } = useStations();
  const { inspections } = useInspections({ limit: 5 });

  const currentMonth = new Date().getMonth() + 1;
  const currentYear = new Date().getFullYear();

  // 이번달 완료 건수
  const thisMonthDone = inspections.filter(i => {
    const d = new Date(i.inspection_date);
    return d.getMonth() + 1 === currentMonth && d.getFullYear() === currentYear;
  }).length;

  return (
    <div className="p-8 max-w-[1100px]">
      {/* 헤더 */}
      <div className="mb-7">
        <h1 className="text-2xl font-[800] tracking-tight">대시보드</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          {currentYear}년 {currentMonth}월 — {profile?.sector?.name ?? ''} 충전소 현황
        </p>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="관리 충전소" value={stations.length} sub="총 개소" color="blue" />
        <StatCard label="이번달 완료" value={thisMonthDone} sub="건" color="green" />
        <StatCard label="미점검" value={stations.length - thisMonthDone} sub="개소" color="yellow" />
        <StatCard
          label="총 수전용량"
          value={`${(stations.reduce((s, st) => s + (st.capacity ?? 0), 0) / 1000).toFixed(1)}MW`}
          sub="관리 설비 합산"
        />
      </div>

      {/* 2단 */}
      <div className="grid md:grid-cols-[1fr_360px] gap-4">

        {/* 최근 이력 */}
        <div className="toss-card">
          <div className="text-sm font-bold mb-4">
            최근 점검이력
            <span className="font-normal ml-1" style={{ color: 'var(--text-secondary)' }}>— 이번달</span>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {inspections.length === 0 && (
              <p className="py-6 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                이번달 점검이력이 없습니다
              </p>
            )}
            {inspections.map(ins => (
              <div key={ins.id} className="flex items-center gap-3.5 py-3.5">
                <span className="w-2 h-2 rounded-full flex-shrink-0 bg-[#05C072] shadow-[0_0_6px_#05C072]" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{ins.station?.base_name}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                    {ins.inspection_date} · {ins.inspector_name}
                  </div>
                </div>
                <TypeBadge type={ins.inspection_type} />
                {ins.file_path && (
                  <a href={ins.file_path} download
                    className="w-[30px] h-[30px] rounded-[8px] flex items-center justify-center text-sm transition-all"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
                    onMouseEnter={e => Object.assign(e.currentTarget.style, { background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)' })}
                    onMouseLeave={e => Object.assign(e.currentTarget.style, { background: 'var(--bg-input)', color: 'var(--text-secondary)', borderColor: 'var(--border)' })}
                  >⬇</a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* 충전소 현황 */}
        <div className="toss-card">
          <div className="text-sm font-bold mb-4">충전소 점검 현황</div>
          <div className="space-y-2">
            {stations.slice(0, 6).map(station => {
              const done = inspections.some(i => i.station_id === station.id);
              return (
                <div key={station.id}
                  className="flex items-center gap-3 px-3.5 py-3 rounded-[10px] transition-all cursor-pointer border border-transparent hover:border-[#3182F6] hover:bg-[rgba(49,130,246,.06)]"
                  style={{ background: 'var(--bg-elevated)' }}>
                  <span className="text-lg">{done ? '🟢' : '🟡'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold truncate">{station.base_name}</div>
                    <div className="text-[11px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      {station.capacity}kW · {station.voltage}V
                    </div>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md
                    ${done
                      ? 'bg-[rgba(5,192,114,.12)] text-[#05C072]'
                      : 'bg-[rgba(245,166,35,.12)] text-[#F5A623]'
                    }`}>
                    {done ? '완료' : '미점검'}
                  </span>
                </div>
              );
            })}
          </div>
          <Link href="/inspection">
            <button className="w-full mt-3 py-2 text-sm font-semibold rounded-[8px] transition-colors"
              style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
              + 점검 생성하기
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
