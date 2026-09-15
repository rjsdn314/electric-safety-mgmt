'use client';
// 별지7 열화상 사진 선택·분류 UI (점검 생성 화면 + 점검 이력 '열화상 추가'에서 공용)
//  · 고압: 부위 목록은 계정별 설정(/thermal-parts), AI 분류 → 실패 시 무료 분류(내 예시 비교)
//  · 저압: PF/PT/CH 없음 → 촬영 순서(전경 1장 + 상별 3장)로 자동 지정, 분류 없음
//  · 반영 후 learn()으로 확정 분류(특히 사용자가 고친 사진)를 계정별 예시로 저장 → 다음 분류에 참고(고압만)
import { useEffect, useRef, useState } from 'react';
import {
  loadShots, smoothByTriplets, downscaleToBase64, buildB7Payload, buildLowPayload, assignLowParts,
  LOW_MEASURE, LOW_OVERVIEW, type Part, type ThermalShot, type B7PanelData,
} from '@/lib/thermal/gtc400c';
import { DEFAULT_PARTS, type ThermalPart } from '@/lib/thermal/parts';
import { classifyLocally, invalidateExamples } from '@/lib/thermal/localClassify';

export type UIShot = ThermalShot & { url: string };
export type PanelThermal = { shots: UIShot[]; skipped: string[]; status: string; busy: boolean };
const EMPTY: PanelThermal = { shots: [], skipped: [], status: '', busy: false };
const verdictOf = (temps: number[]) => {
  if (temps.length < 2) return '5℃ 이하';
  const d = Math.max(...temps) - Math.min(...temps);
  return d <= 5 ? '5℃ 이하' : d < 10 ? '5℃ 초과 ~ 10℃' : '10℃ 이상';
};
const revoke = (t?: PanelThermal) => t?.shots.forEach(s => URL.revokeObjectURL(s.url));
const LOW_OPTIONS = [
  { value: LOW_MEASURE, label: '측정 (Point)' },
  { value: LOW_OVERVIEW, label: '전경 (기입 제외)' },
];

// 수배전반 인덱스별 사진·온도·부위 분류 상태
export function useThermalPanels() {
  const [thermal, setThermal] = useState<PanelThermal[]>([]);
  const [parts, setParts] = useState<ThermalPart[]>(DEFAULT_PARTS);
  const [lowVoltage, setLowVoltageState] = useState(false);
  const ref = useRef(thermal);
  ref.current = thermal;
  const partsRef = useRef(parts);
  partsRef.current = parts;
  const lowRef = useRef(lowVoltage);
  lowRef.current = lowVoltage;
  useEffect(() => () => ref.current.forEach(revoke), []);

  // 계정별 부위 목록
  useEffect(() => {
    fetch('/api/thermal/profile', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (Array.isArray(j?.parts) && j.parts.length) setParts(j.parts); })
      .catch(() => {});
  }, []);

  const patch = (idx: number, p: Partial<PanelThermal>) =>
    setThermal(prev => { const next = [...prev]; next[idx] = { ...(next[idx] || EMPTY), ...p }; return next; });

  const setLowVoltage = (v: boolean) => {
    if (v === lowRef.current) return;
    lowRef.current = v;
    setLowVoltageState(v);
    ref.current.forEach(revoke);
    setThermal([]);   // 고압↔저압 규칙이 달라 선택한 사진은 비움
  };

  const classify = async (idx: number, shots: UIShot[]) => {
    patch(idx, { busy: true, status: 'AI가 부위를 분류하는 중...' });
    try {
      const images = await Promise.all(shots.map(s => downscaleToBase64(s.y)));
      const res = await fetch('/api/thermal/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      const valid = new Set(partsRef.current.map(p => p.name));
      const labels = smoothByTriplets((j.parts as (Part | null)[]).map(p => (p && valid.has(p) ? p : null)));
      patch(idx, {
        shots: shots.map((s, i) => ({ ...s, part: labels[i] ?? null, ai: labels[i] ?? null })),
        busy: false,
        status: `✅ AI 분류 완료${j.examples_used ? ` (내 예시 ${j.examples_used}장 참고)` : ''} — 틀린 부위는 아래에서 고치면 다음 분류부터 반영됩니다.`,
      });
    } catch (e: any) {
      // AI 불가(키·크레딧 없음 등) → 무료 분류: 내 예시 사진과 비교(브라우저)
      patch(idx, { status: '🆓 AI 없이 내 예시 사진과 비교해 분류하는 중... (처음 한 번은 분석 모델을 받느라 조금 걸립니다)' });
      try {
        const r = await classifyLocally(shots.map(s => s.y), partsRef.current.map(p => p.name));
        if (!r.examplesUsed) throw new Error('아직 저장된 내 예시가 없습니다 — 이번엔 직접 골라 반영하면 다음부터 자동으로 추천됩니다');
        const labels = smoothByTriplets(r.parts);
        patch(idx, {
          shots: shots.map((s, i) => ({ ...s, part: labels[i] ?? null, ai: labels[i] ?? null })),
          busy: false,
          status: `🆓 무료 분류 완료 (내 예시 ${r.examplesUsed}장과 비교${r.missing.length ? ` · 예시 없는 부위: ${r.missing.join('/')}` : ''}) — AI보다 틀릴 수 있으니 꼭 확인하고, 틀린 건 고쳐주세요.`,
        });
      } catch (e2: any) {
        patch(idx, { shots, busy: false, status: `⚠️ 자동 분류를 못 해 직접 지정이 필요합니다 (${e2.message})` });
      }
    }
  };

  // 사진 선택 → X/Y 짝짓기 + 온도 추출(브라우저) → 고압: 분류 / 저압: 촬영 순서로 지정
  const addFiles = async (idx: number, fileList: FileList | null) => {
    if (!fileList || !fileList.length) return;
    revoke(ref.current[idx]);
    patch(idx, { shots: [], busy: true, status: '사진에서 온도 읽는 중...' });
    try {
      const { shots, skipped } = await loadShots(Array.from(fileList));
      const ui: UIShot[] = shots.map(s => ({ ...s, url: URL.createObjectURL(s.y) }));
      if (!ui.length) { patch(idx, { skipped, busy: false, status: '⚠️ 온도 데이터가 있는 열화상 사진(RB…Y.JPG)을 찾지 못했습니다.' }); return; }
      if (lowRef.current) {
        const labels = assignLowParts(ui.length);
        patch(idx, {
          shots: ui.map((s, i) => ({ ...s, part: labels[i] })), skipped, busy: false,
          status: `✅ 저압: 촬영 순서로 지정했습니다 (${ui.length % 4 === 0 ? '4장마다 첫 장 = 전경, 다음 3장 = Point 1~3' : '전경/측정 자동 지정'}) — 다르면 아래에서 고쳐주세요.`,
        });
        return;
      }
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

  // 전송용: 수배전반 수만큼 온도 + 대표 사진 (사진 없는 수배전반은 null)
  const buildPanels = (count: number): Promise<(B7PanelData | null)[]> => {
    const names = parts.map(p => p.name);
    return Promise.all(Array.from({ length: count }, (_, i) => {
      const shots = thermal[i]?.shots;
      if (!shots?.length) return Promise.resolve(null);
      return lowVoltage ? buildLowPayload(shots) : buildB7Payload(shots, names);
    }));
  };

  // 계정별 학습(고압만): 부위마다 고친 사진 우선 최대 3장을 축소해 예시로 저장 (실패해도 무시)
  const learn = () => {
    if (lowRef.current) return;
    const all = ref.current.flatMap(t => t?.shots || []).filter(s => s.part);
    const picks: UIShot[] = [];
    for (const p of partsRef.current) {
      const list = all.filter(s => s.part === p.name);
      picks.push(...[...list.filter(s => s.ai !== s.part), ...list.filter(s => s.ai === s.part)].slice(0, 3));
    }
    if (!picks.length) return;
    void (async () => {
      try {
        const examples = await Promise.all(picks.map(async s => ({ part: s.part, image: await downscaleToBase64(s.y, 256, 0.7) })));
        await fetch('/api/thermal/examples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ examples }) });
        invalidateExamples();
      } catch { /* 학습 저장 실패는 점검표 생성에 영향 없음 */ }
    })();
  };

  return {
    thermal, parts, lowVoltage, setLowVoltage, addFiles, classify, setPart, clear, reset, removeAt, buildPanels, learn,
    hasAny: thermal.some(t => t?.shots.length),
    busy: thermal.some(t => t?.busy),
    unassigned: thermal.reduce((n, t) => n + (t?.shots.filter(s => !s.part).length || 0), 0),
  };
}

export function ThermalPhotoBox({ idx, api, hint }: { idx: number; api: ReturnType<typeof useThermalPanels>; hint?: string }) {
  const th = api.thermal[idx];
  const shots = th?.shots || [];
  const low = api.lowVoltage;
  const options = low ? LOW_OPTIONS : api.parts.map(p => ({ value: p.name, label: p.name }));
  const measureNames = low ? [LOW_MEASURE] : api.parts.map(p => p.name);
  const repIds = new Set(measureNames.map(p => {
    const list = shots.filter(s => s.part === p);
    return list.length ? list.reduce((a, b) => (b.center > a.center ? b : a)).id : '';
  }));
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)' };
  return (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'var(--bg-elevated)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <label style={labelStyle}>🌡️ 열화상 사진 (별지7{low ? ' · 저압' : ''}) — 찍은 사진 전부 선택</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {shots.length > 0 && !th?.busy && (
            <>
              {!low && <button onClick={() => api.classify(idx, shots)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>🤖 다시 분류</button>}
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
        {low ? (
          <>저압반: 촬영 순서대로 <b>전경 1장 + 상별 접속부 3장</b>을 한 세트로 봅니다. 측정 3장의 중심온도가 Point 1~3에 들어가고, 그중 온도가 가장 높은 사진(실화상+열화상)이 엑셀에 들어갑니다.</>
        ) : (
          <>RB…X/Y.JPG를 모두 고르면 사진 속 온도(중심점)를 읽어 부위별 Point 1~3에 넣고, 부위마다 온도가 가장 높은 사진(실화상+열화상)만 엑셀에 넣습니다.
            {' '}내 촬영 부위: <b>{api.parts.map(p => p.name).join(' / ')}</b> (<a href="/thermal-parts" style={{ color: 'var(--accent)' }}>변경</a>)</>
        )}
        {hint && <><br />{hint}</>}
      </div>
      {th?.status && <div style={{ fontSize: 12.5, marginTop: 8, color: 'var(--text-secondary)' }}>{th.status}</div>}
      {th?.skipped?.length ? <div style={{ fontSize: 11.5, marginTop: 4, color: 'var(--text-tertiary)' }}>제외된 파일 {th.skipped.length}개 (온도 데이터 없음/짝 없음)</div> : null}
      {shots.length > 0 && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginTop: 10 }}>
            {shots.map((s, si) => (
              <div key={s.id} style={{ borderRadius: 10, overflow: 'hidden', border: `1.5px solid ${repIds.has(s.id) ? 'var(--accent)' : s.part ? 'var(--border)' : '#f59e0b'}`, background: 'var(--bg-card)', opacity: low && s.part === LOW_OVERVIEW ? 0.7 : 1 }}>
                <div style={{ position: 'relative' }}>
                  <img src={s.url} alt={s.id} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
                  {repIds.has(s.id) && <span style={{ position: 'absolute', top: 4, left: 4, fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: 'var(--accent)', color: '#fff' }}>★ 엑셀 삽입</span>}
                  {!low && s.ai !== undefined && s.part !== s.ai && <span style={{ position: 'absolute', top: 4, right: 4, fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 6, background: '#f59e0b', color: '#fff' }}>수정됨</span>}
                </div>
                <div style={{ padding: '6px 8px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{s.id} · 중심 <b style={{ color: 'var(--text-primary)' }}>{s.center.toFixed(1)}℃</b></div>
                  <select value={s.part || ''} onChange={e => api.setPart(idx, si, e.target.value || null)} style={{ width: '100%', marginTop: 4, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 12, fontFamily: 'inherit' }}>
                    <option value="">— 제외/미지정 —</option>
                    {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, display: 'grid', gap: 4, fontSize: 12.5 }}>
            {measureNames.map(p => {
              const temps = shots.filter(s => s.part === p).map(s => s.center);
              return (
                <div key={p} style={{ color: temps.length === 3 ? 'var(--text-secondary)' : '#d97706' }}>
                  <b style={{ color: 'var(--text-primary)' }}>{low ? '저압반' : p}</b> · Point {temps.slice(0, 3).map(t => t.toFixed(1) + '℃').join(' / ') || '없음'}
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
