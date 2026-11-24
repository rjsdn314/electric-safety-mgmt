'use client';
// ============================================================
// components/ui/ScheduleEditor.tsx — 현장별 월별 점검 종류 설정
//  · 달을 누를 때마다 월차 → 분기 → 반기 → 연차 순으로 바뀜
// ============================================================
import { INSP_TYPES, DEFAULT_SCHEDULE, isDefaultSchedule, scheduleSummary, type Schedule } from '@/lib/utils/schedule';

const COLOR: Record<string, { bg: string; fg: string; bd: string }> = {
  월차: { bg: 'var(--bg-card)', fg: 'var(--text-secondary)', bd: 'var(--border)' },
  분기: { bg: 'var(--accent-soft)', fg: 'var(--accent)', bd: 'var(--accent)' },
  반기: { bg: 'var(--warning-soft, #FFF4E5)', fg: 'var(--warning, #B26A00)', bd: 'var(--warning, #B26A00)' },
  연차: { bg: 'var(--positive-soft, #E8F5EE)', fg: 'var(--positive, #2F7D4F)', bd: 'var(--positive, #2F7D4F)' },
};

export function ScheduleEditor({ value, onChange }: { value: Schedule; onChange: (s: Schedule) => void }) {
  const next = (t: string) => INSP_TYPES[(INSP_TYPES.indexOf(t as any) + 1) % INSP_TYPES.length];
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6 }}>
        {Array.from({ length: 12 }, (_, i) => {
          const m = String(i + 1); const t = value[m]; const c = COLOR[t];
          return (
            <button key={m} type="button" onClick={() => onChange({ ...value, [m]: next(t) })} title="누를 때마다 월차 → 분기 → 반기 → 연차"
              style={{ padding: '7px 4px', borderRadius: 8, border: `1px solid ${c.bd}`, background: c.bg, color: c.fg, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.25 }}>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{m}월</div>
              <div style={{ fontSize: 13, fontWeight: 700 }}>{t}</div>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>
        <span style={{ flex: 1 }}>{scheduleSummary(value)} · 달을 누르면 종류가 바뀝니다</span>
        {!isDefaultSchedule(value) && (
          <button type="button" onClick={() => onChange({ ...DEFAULT_SCHEDULE })} style={{ fontSize: 12, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', cursor: 'pointer' }}>기본값으로</button>
        )}
      </div>
    </div>
  );
}
