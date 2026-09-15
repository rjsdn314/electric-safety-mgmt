'use client';
// 별지7 열화상 사진 선택·분류 UI (점검 생성 화면 + 점검 이력 '열화상 추가'에서 공용)
import { useEffect, useRef, useState } from 'react';
import { loadShots, smoothByTriplets, downscaleToBase64, buildB7Payload, PARTS, type Part, type ThermalShot, type B7PanelData } from '@/lib/thermal/gtc400c';

export type UIShot = ThermalShot & { url: string };
export type PanelThermal = { shots: UIShot[]; skipped: string[]; status: string; busy: boolean };
const EMPTY: PanelThermal = { shots: [], skipped: [], status: '', busy: false };
const PART_LABEL: Record<Part, string> = { PF: 'PF (전력퓨즈)', PT: 'PT (계기용변압기)', CH: 'CH (케이블헤드)' };
const verdictOf = (temps: number[]) => {
  if (temps.length < 2) return '5℃ 이하';
  const d = Math.max(...temps) - Math.min(...temps);
  return d <= 5 ? '5℃ 이하' : d < 10 ? '5℃ 초과 ~ 10℃' : '10℃ 이상';
};
const revoke = (t?: PanelThermal) => t?.shots.forEach(s => URL.revokeObjectURL(s.url));

// 수배전반 인덱스별 사진·온도·부위 분류 상태
export function useThermalPanels() {
  const [thermal, setThermal] = useState<PanelThermal[]>([]);
  const ref = useRef(thermal);
  ref.current = thermal;
  useEffect(() => () => ref.current.forEach(revoke), []);

  const patch = (idx: number, p: Partial<PanelThermal>) =>
    setThermal(prev => { const next = [...prev]; next[idx] = { ...(next[idx] || EMPTY), ...p }; return next; });

  const classify = async (idx: number, shots: UIShot[]) => {
    patch(idx, { busy: true, status: 'AI가 부위(PF/PT/CH)를 분류하는 중...' });
    try {
      const images = await Promise.all(shots.map(s => downscaleToBase64(s.y)));
      const res = await fetch('/api/thermal/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images }) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const parts = smoothByTriplets(j.parts as (Part | null)[]);
      patch(idx, { shots: shots.map((s, i) => ({ ...s, part: parts[i] ?? null })), busy: false, status: '✅ AI 분류 완료 — 틀린 부위는 아래에서 바로 고칠 수 있습니다.' });
    } catch (e: any) {
      patch(idx, { shots, busy: false, status: `⚠️ AI 분류를 사용할 수 없어 직접 지정이 필요합니다 (${e.message})` });
    }
  };

  // 사진 선택 → X/Y 짝짓기 + 온도 추출(브라우저) → AI 부위 분류
  const addFiles = async (idx: number, fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    revoke(ref.current[idx]);
    patch(idx, { shots: [], busy: true, status: '사진에서 온도 읽는 중...' });
    try {
      const { shots, skipped } = await loadShots(Array.from(fileList));
      const ui: UIShot[] = shots.map(s => ({ ...s, url: URL.createObjectURL(s.y) }));
      if (!ui.length) { patch(idx, { skipped, busy: false, status: '⚠️ 온도 데이터가 있는 열화상 사진(RB…Y.JPG)을 찾지 못했습니다.' }); return; }
      patch(idx, { shots: ui, skipped });
      await classify(idx, ui);
    } catch (e: any) {
      patch(idx, { busy: false, status: '❌ 사진 처리 실패: ' + e.message });
    }
  };

  const setPart = (idx: number, shotIdx: number, part: Part | null) =>
    setThermal(prev => {
      const next = [...prev]; const cur = next[idx]; if (!cur) return prev;
      next[idx] = { ...cur, shots: cur.shots.map((s, i) => (i === shotIdx ? { ...s, part } : s)) };
      return next;
    });

  const clear = (idx: number) => { revoke(ref.current[idx]); patch(idx, EMPTY); };
  const reset = () => { ref.current.forEach(revoke); setThermal([]); };
  const removeAt = (idx: number) => { revoke(ref.current[idx]); setThermal(prev => prev.filter((_, i) => i !== idx)); };

  // 전송용: 수배전반 수만큼 부위 온도 + 최고온도 대표 사진 (사진 없는 수배전반은 null)
  const buildPanels = (count: number): Promise<(B7PanelData | null)[]> =>
    Promise.all(Array.from({ length: count }, (_, i) => (thermal[i]?.shots.length ? buildB7Payload(thermal[i].shots) : Promise.resolve(null))));

  return {
    thermal, addFiles, classify, setPart, clear, reset, removeAt, buildPanels,
    hasAny: thermal.some(t => t?.shots.length),
    busy: thermal.some(t => t?.busy),
    unassigned: thermal.reduce((n, t) => n + (t?.shots.filter(s => !s.part).length || 0), 0),
  };
}

export function ThermalPhotoBox({ idx, api, hint }: { idx: number; api: ReturnType<typeof useThermalPanels>; hint?: string }) {
  const th = api.thermal[idx];
  const shots = th?.shots || [];
  const repIds = new Set(PARTS.map(p => {
    const list = shots.filter(s => s.part === p);
    return list.length ? list.reduce((a, b) => (b.center > a.center ? b : a)).id : '';
  }));
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' };
  return (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'var(--bg-elevated)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <label style={labelStyle}>🌡️ 열화상 사진 (별지7) — 찍은 사진 전부 선택</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {shots.length > 0 && !th?.busy && (
            <>
              <button onClick={() => api.classify(idx, shots)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>🤖 다시 분류</button>
              <button onClick={() => api.clear(idx)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✕ 비우기</button>
            </>
          )}
          <label style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: th?.busy ? 'wait' : 'pointer', opacity: th?.busy ? 0.6 : 1 }}>
            📷 사진 선택
            <input type="file" accept="image/jpeg,.jpg,.jpeg" multiple disabled={th?.busy} style={{ display: 'none' }} onChange={e => { api.addFiles(idx, e.target.files); e.target.value = ''; }} />
          </label>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
        RB…X/Y.JPG를 모두 고르면 사진 속 온도(중심점)를 읽어 부위별 Point 1~3에 넣고, 부위마다 온도가 가장 높은 사진(실화상+열화상)만 엑셀에 넣습니다.
        {hint && <><br />{hint}</>}
      </div>
      {th?.status && <div style={{ fontSize: 12.5, marginTop: 8, color: 'var(--text-secondary)' }}>{th.status}</div>}
      {th?.skipped?.length ? <div style={{ fontSize: 11.5, marginTop: 4, color: 'var(--text-tertiary)' }}>제외된 파일 {th.skipped.length}개 (온도 데이터 없음/짝 없음)</div> : null}
      {shots.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 10 }}>
            {shots.map((s, si) => (
              <div key={s.id} style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${repIds.has(s.id) ? 'var(--accent)' : s.part ? 'var(--border)' : '#f59e0b'}`, background: 'var(--bg-card)' }}>
                <div style={{ position: 'relative' }}>
                  <img src={s.url} alt={s.id} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
                  {repIds.has(s.id) && <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: 'var(--accent)', color: '#fff' }}>★ 엑셀 삽입</span>}
                </div>
                <div style={{ padding: '6px 8px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.id} · 중심 <b style={{ color: 'var(--text-primary)' }}>{s.center.toFixed(1)}℃</b></div>
                  <select value={s.part || ''} onChange={e => api.setPart(idx, si, (e.target.value || null) as Part | null)} style={{ width: '100%', marginTop: 4, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit' }}>
                    <option value="">— 제외/미지정 —</option>
                    {PARTS.map(p => <option key={p} value={p}>{PART_LABEL[p]}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, display: 'grid', gap: 4, fontSize: 12.5 }}>
            {PARTS.map(p => {
              const temps = shots.filter(s => s.part === p).map(s => s.center);
              return (
                <div key={p} style={{ color: temps.length === 3 ? 'var(--text-secondary)' : '#d97706' }}>
                  <b style={{ color: 'var(--text-primary)' }}>{p}</b> · Point {temps.slice(0, 3).map(t => t.toFixed(1) + '℃').join(' / ') || '없음'}
                  {temps.length > 0 && ` · ${verdictOf(temps.slice(0, 3))}`}
                  {temps.length !== 3 && ` (⚠️ ${temps.length}장 — 3장이어야 합니다${temps.length > 3 ? ', 앞 3장만 기입' : ''})`}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
