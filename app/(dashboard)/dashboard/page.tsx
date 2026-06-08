'use client';
// ============================================================
// app/(dashboard)/dashboard/page.tsx — WATER 디자인 시스템 적용
// ============================================================
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

// ── 통계 카드 컴포넌트 ──────────────────────────────────────
function StatCard({ label, value, sub, color, accentColor }: {
  label: string; value: string | number;
  sub?: string; color?: string; accentColor?: string;
}) {
  const accent = accentColor || '#0066ff';
  return (
    <div
      style={{
        background: 'var(--bg-card)',
        border: `1px solid var(--border)`,
        borderLeft: `3px solid ${accent}`,
        borderRadius: 'var(--radius)',
        padding: '20px 22px',
        boxShadow: 'var(--shadow)',
        transition: 'all .15s',
        cursor: 'default',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow-md)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLDivElement).style.boxShadow = 'var(--shadow)';
        (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)';
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: 10, letterSpacing: '0.02em' }}>
        {label}
      </div>
      <div style={{
        fontSize: 28, fontWeight: 800, letterSpacing: '-1px',
        color: color || accent,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
      }}>
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>
      )}
    </div>
  );
}

// ── 점검유형 배지 ────────────────────────────────────────────
function TypeBadge({ type }: { type: string }) {
  const map: Record<string, { bg: string; color: string }> = {
    '월차': { bg: 'rgba(0,102,255,.1)',   color: '#0066ff' },
    '분기': { bg: 'rgba(245,158,11,.1)',  color: '#d97706' },
    '반기': { bg: 'rgba(245,158,11,.1)',  color: '#d97706' },
    '연차': { bg: 'rgba(16,185,129,.1)', color: '#059669' },
  };
  const s = map[type] ?? { bg: 'rgba(0,0,0,.06)', color: '#4b5563' };
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, padding: '2px 8px',
      borderRadius: 99, background: s.bg, color: s.color,
    }}>{type}</span>
  );
}

// ── 페이지 본문 ──────────────────────────────────────────────
export default function DashboardPage() {
  const { profile } = useAuth();
  // 사용자별 대시보드: 본인이 등록한 관리구역(충전소) 기준. 관리자는 본인 + 소유자 없는(레거시) 포함.
  const [stations, setStations] = useState<any[]>([]);
  const [inspections, setInspections] = useState<any[]>([]);
  useEffect(() => {
    const load = async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).single();
      const isAdmin = prof?.role === 'admin';
      let sq = sb.from('stations').select('*').eq('is_active', true).order('name');
      sq = isAdmin ? sq.or(`user_id.eq.${user.id},user_id.is.null`) : sq.eq('user_id', user.id);
      const { data: sts } = await sq;
      const list = sts || [];
      setStations(list);
      const ids = list.map((s: any) => s.id);
      if (ids.length) {
        const { data: insps } = await sb.from('inspections').select('*')
          .in('station_id', ids).order('inspection_date', { ascending: false }).limit(500);
        const stMap = new Map(list.map((s: any) => [s.id, s]));
        setInspections((insps || []).map((i: any) => ({ ...i, station: stMap.get(i.station_id) })));
      } else { setInspections([]); }
    };
    load();
  }, []);

  const currentMonth = new Date().getMonth() + 1;
  const currentYear  = new Date().getFullYear();

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

  return (
    <div style={{ padding: '32px 36px 60px', maxWidth: 900 }}>

      {/* 헤더 */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{
          fontSize: 28, fontWeight: 900, letterSpacing: '-1px',
          color: 'var(--text-primary)', margin: '0 0 8px 0', lineHeight: 1.2,
        }}>대시보드</h1>
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          background: 'rgba(0,102,255,.08)', color: '#0066ff',
          borderRadius: 99, padding: '3px 10px',
          fontSize: 11, fontWeight: 700,
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {currentYear}년 {currentMonth}월 — {profile?.sector?.name ?? ''} 충전소 현황
        </span>
      </div>

      {/* 통계 카드 4열 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 14,
        marginBottom: 24,
      }}>
        <StatCard label="관리 충전소" value={stations.length}                           sub="총 개소"   accentColor="#0066ff" />
        <StatCard label="이번달 완료" value={thisMonthDone}                              sub="건"       accentColor="#10b981" />
        <StatCard label="미점검"       value={pendingStations.length}           sub="개소"     accentColor="#f59e0b" />
        <StatCard
          label="총 수전용량"
          value={`${(stations.reduce((s, st) => s + (st.capacity ?? 0), 0) / 1000).toFixed(1)}MW`}
          sub="관리 설비 합산"
          accentColor="#0066ff"
        />
      </div>

{/* ── 이번달 미점검 개소 (한눈에 보기) ── */}
      <div style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid #f59e0b',
        borderRadius: 'var(--radius)',
        padding: '22px 24px',
        boxShadow: 'var(--shadow)',
        marginBottom: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
            이번달 미점검 개소
          </span>
          <span style={{
            fontSize: 12, fontWeight: 800, padding: '2px 10px', borderRadius: 99,
            background: 'rgba(245,158,11,.12)', color: '#d97706',
            fontFamily: "'JetBrains Mono', monospace",
          }}>{pendingStations.length}개소</span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 'auto' }}>— {currentMonth}월 기준</span>
        </div>
        {pendingStations.length === 0 ? (
          <p style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>
            🎉 이번달 모든 충전소 점검이 완료되었습니다</p>
        ) : (<>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {visiblePending.map(station => (
              <Link key={station.id} href="/inspection" style={{ textDecoration: 'none' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: 'var(--bg-elevated)',
                  border: '1px solid transparent', transition: 'all .15s', cursor: 'pointer',
                }}
                onMouseEnter={e => Object.assign((e.currentTarget as HTMLDivElement).style, { borderColor: '#f59e0b', background: 'rgba(245,158,11,.06)' })}
                onMouseLeave={e => Object.assign((e.currentTarget as HTMLDivElement).style, { borderColor: 'transparent', background: 'var(--bg-elevated)' })}
                >
                  <span style={{ fontSize: 14 }}>🟡</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {station.base_name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {station.capacity}kW · {station.voltage}V
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
  {pendingShow < pendingStations.length && (
  <button onClick={() => setPendingShow(n => n + 10)} style={{ width: '100%', marginTop: 12, padding: '10px 0', fontSize: 13, fontWeight: 700, borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
    더보기 ({pendingStations.length - pendingShow}개 더)
  </button>
        )}
        </>
            )}
      </div>

            {/* 2단 그리드: 최근 이력 + 충전소 현황 */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 360px',
        gap: 14,
        alignItems: 'start',
      }}>

        {/* ── 최근 점검이력 ── */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '22px 24px',
          boxShadow: 'var(--shadow)',
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-primary)' }}>
              최근 점검이력
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>— 이번달</span>
          </div>
          <div style={{ borderTop: '1px solid var(--border)' }}>
            {inspections.length === 0 && (
              <p style={{
                padding: '32px 0', textAlign: 'center',
                fontSize: 13, color: 'var(--text-tertiary)',
              }}>이번달 점검이력이 없습니다</p>
            )}
            {inspections.map(ins => (
              <div key={ins.id} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: '12px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <span style={{
                  width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                  background: '#10b981',
                  boxShadow: '0 0 6px rgba(16,185,129,.5)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {ins.station?.base_name}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                    {ins.inspection_date} · {ins.inspector_name}
                  </div>
                </div>
                <TypeBadge type={ins.inspection_type} />
                {ins.file_path && (
                  <a href={ins.file_path} download style={{
                    width: 28, height: 28, borderRadius: 8,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, textDecoration: 'none', transition: 'all .15s',
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border)',
                    color: 'var(--text-tertiary)',
                  }}
                  onMouseEnter={e => Object.assign((e.currentTarget as HTMLAnchorElement).style, {
                    background: 'var(--accent-soft)', color: 'var(--accent)', borderColor: 'var(--accent)'
                  })}
                  onMouseLeave={e => Object.assign((e.currentTarget as HTMLAnchorElement).style, {
                    background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', borderColor: 'var(--border)'
                  })}
                  >⬇</a>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── 충전소 점검 현황 ── */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: '22px 24px',
          boxShadow: 'var(--shadow)',
        }}>
          <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text-primary)', marginBottom: 14 }}>
            충전소 점검 현황
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {stations.slice(0, 6).map(station => {
              const done = inspections.some(i => i.station_id === station.id);
              return (
                <div key={station.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 12px', borderRadius: 10,
                  background: 'var(--bg-elevated)',
                  border: '1px solid transparent',
                  transition: 'all .15s', cursor: 'pointer',
                }}
                onMouseEnter={e => Object.assign((e.currentTarget as HTMLDivElement).style, {
                  borderColor: 'var(--accent)', background: 'var(--accent-soft)',
                })}
                onMouseLeave={e => Object.assign((e.currentTarget as HTMLDivElement).style, {
                  borderColor: 'transparent', background: 'var(--bg-elevated)',
                })}
                >
                  <span style={{ fontSize: 16 }}>{done ? '🟢' : '🟡'}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {station.base_name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
                      {station.capacity}kW · {station.voltage}V
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                    background: done ? 'rgba(16,185,129,.1)' : 'rgba(245,158,11,.1)',
                    color: done ? '#059669' : '#d97706',
                  }}>{done ? '완료' : '미점검'}</span>
                </div>
              );
            })}
          </div>
          <Link href="/inspection">
            <button style={{
              width: '100%', marginTop: 12,
              padding: '10px 0', fontSize: 13, fontWeight: 700,
              borderRadius: 99, border: 'none', cursor: 'pointer',
              background: 'linear-gradient(135deg, #0066ff, #00b8d9)',
              color: '#fff',
              boxShadow: '0 4px 12px rgba(0,102,255,.2)',
              transition: 'all .15s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '0.9';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.opacity = '1';
              (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
            }}
            >
              + 점검 생성하기
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
