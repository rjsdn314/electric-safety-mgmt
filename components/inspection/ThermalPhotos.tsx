'use client';
// 별지7 열화상 사진 선택·분류 UI (점검 생성 화면 + 점검 이력 '열화상 추가'에서 공용)
//  · 부위 목록 우선순위: 현장별 설정(양식·설비가 다른 현장) → 계정 설정(/thermal-parts) → 기본 PF/PT/CH
//  · 고압: AI 분류 → 실패 시 무료 분류(내 예시 비교)
//  · 저압(현장별 설정 없을 때): 촬영 순서(전경 1장 + 상별 3장)로 자동 지정, 분류 없음
//  · 반영 후 learn()으로 확정 분류(특히 사용자가 고친 사진)를 계정별 예시로 저장 → 다음 분류에 참고
//  · 저장 후 archivePhotos()로 선택한 사진 전부를 점검 폴더(YYYYMMDD_현장_종류\약칭\[수배전반번호])에 저장.
//    '폴더 선택'으로 고른 사진은 복사 확인 후 원본을 삭제(이동), '사진 선택'으로 고른 사진은 복사만.
import { useEffect, useRef, useState } from 'react';
import {
  loadShots, smoothByTriplets, downscaleToBase64, buildB7Payload, buildLowPayload, assignLowParts,
  LOW_MEASURE, LOW_OVERVIEW, type Part, type ThermalShot, type B7PanelData,
} from '@/lib/thermal/gtc400c';
import { DEFAULT_PARTS, type ThermalPart } from '@/lib/thermal/parts';
import { classifyLocally, invalidateExamples } from '@/lib/thermal/localClassify';
import { archivePanelPhotos } from '@/lib/thermal/archive';

export type UIShot = ThermalShot & { url: string };
// files = 사용자가 고른 사진 전부(점검 폴더 저장용), source = '폴더 선택'으로 고른 경우 원본 위치(이동 시 삭제용)
export type PanelThermal = {
  shots: UIShot[]; skipped: string[]; status: string; busy: boolean;
  files?: File[]; source?: { name: string; dir: any }[] | null;
};
const EMPTY: PanelThermal = { shots: [], skipped: [], status: '', busy: false, files: [], source: null };
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
  const [accountParts, setAccountParts] = useState<ThermalPart[]>(DEFAULT_PARTS);
  const [stationParts, setStationPartsState] = useState<ThermalPart[] | null>(null);
  const [stationId, setStationId] = useState<string | null>(null);
  const [lowStation, setLowStation] = useState(false);
  const [canPickFolder, setCanPickFolder] = useState(false);

  const parts = stationParts || accountParts;          // 실제로 쓰는 부위 목록
  const low = lowStation && !stationParts;             // 저압 순서 규칙 사용 여부

  const ref = useRef(thermal); ref.current = thermal;
  const partsRef = useRef(parts); partsRef.current = parts;
  const lowRef = useRef(low); lowRef.current = low;
  const stationRef = useRef(stationId); stationRef.current = stationId;
  useEffect(() => () => ref.current.forEach(revoke), []);
  useEffect(() => { setCanPickFolder('showDirectoryPicker' in window); }, []);

  // 계정별 부위 목록
  useEffect(() => {
    fetch('/api/thermal/profile', { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (Array.isArray(j?.parts) && j.parts.length) setAccountParts(j.parts); })
      .catch(() => {});
  }, []);

  const patch = (idx: number, p: Partial<PanelThermal>) =>
    setThermal(prev => { const next = [...prev]; next[idx] = { ...(next[idx] || EMPTY), ...p }; return next; });

  // 현장 선택 시: 고압/저압 + 현장별 부위 목록 불러오기 (현장이 바뀌면 선택한 사진은 비움)
  const setStationContext = ({ stationId: id, lowVoltage }: { stationId: string | null; lowVoltage: boolean }) => {
    const changed = id !== stationRef.current || lowVoltage !== lowStation;
    stationRef.current = id;
    setStationId(id);
    setLowStation(lowVoltage);
    if (!changed) return;
    ref.current.forEach(revoke);
    setThermal([]);
    setStationPartsState(null);
    if (!id) return;
    fetch(`/api/thermal/station-parts?station_id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (stationRef.current === id && Array.isArray(j?.parts) && j.parts.length) setStationPartsState(j.parts); })
      .catch(() => {});
  };

  // 이미 고른 사진 중 새 부위 목록에 없는 부위는 미지정으로
  const dropUnknownParts = (names: string[]) =>
    setThermal(prev => prev.map(t => t && ({ ...t, shots: t.shots.map(s => (s.part && !names.includes(s.part) ? { ...s, part: null } : s)) })));

  // 이 현장만 부위 바꾸기 (순서 = 별지7 온도 행 순서, 엑셀 라벨도 이 이름으로)
  const saveStationParts = async (names: string[]) => {
    const id = stationRef.current;
    if (!id) throw new Error('현장을 먼저 선택해주세요');
    const r = await fetch('/api/thermal/station-parts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ station_id: id, parts: names.map(name => ({ name, desc: '' })) }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || '저장 실패');
    setStationPartsState(j.parts);
    dropUnknownParts(j.parts.map((p: ThermalPart) => p.name));
  };

  const clearStationParts = async () => {
    const id = stationRef.current; if (!id) return;
    const r = await fetch(`/api/thermal/station-parts?station_id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || '해제 실패'); }
    setStationPartsState(null);
    ref.current.forEach(revoke);
    setThermal([]);   // 규칙(계정 부위/저압 순서)이 바뀌므로 사진은 다시 선택
  };

  const classify = async (idx: number, shots: UIShot[]) => {
    patch(idx, { busy: true, status: 'AI가 부위를 분류하는 중...' });
    try {
      const images = await Promise.all(shots.map(s => downscaleToBase64(s.y)));
      const res = await fetch('/api/thermal/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images, station_id: stationRef.current }) });
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

  // 사진 선택 → X/Y 짝짓기 + 온도 추출(브라우저) → 저압 규칙: 촬영 순서로 지정 / 그 외: 분류
  const addFiles = async (idx: number, fileList: FileList | File[] | null, source: PanelThermal['source'] = null) => {
    if (!fileList || !fileList.length) return;
    const files = Array.from(fileList);
    revoke(ref.current[idx]);
    patch(idx, { shots: [], busy: true, status: '사진에서 온도 읽는 중...', files: files.filter(f => /\.jpe?g$/i.test(f.name)), source });
    try {
      const { shots, skipped } = await loadShots(files);
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

  // 폴더 선택: 그 폴더 바로 안의 JPG 전부 (저장 후 점검 폴더로 이동 = 원본 삭제)
  const addFolder = async (idx: number) => {
    let dir: any;
    try { dir = await (window as any).showDirectoryPicker({ mode: 'readwrite' }); }
    catch (e: any) { if (e?.name !== 'AbortError') patch(idx, { status: '❌ 폴더 선택 실패: ' + e.message }); return; }
    const files: File[] = [];
    const source: { name: string; dir: any }[] = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind === 'file' && /\.jpe?g$/i.test(name)) { files.push(await h.getFile()); source.push({ name, dir }); }
    }
    if (!files.length) { patch(idx, { status: `⚠️ '${dir.name}' 폴더에 JPG 사진이 없습니다.` }); return; }
    await addFiles(idx, files, source);
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
      return low ? buildLowPayload(shots) : buildB7Payload(shots, names);
    }));
  };

  // 계정별 학습: 부위마다 고친 사진 우선 최대 3장을 축소해 예시로 저장 (저압 순서 규칙일 땐 저장 안 함, 실패해도 무시)
  //  사진을 옮기기(원본 삭제) 전에 읽어야 하므로, 축소까지 끝난 뒤 반환하고 서버 저장은 뒤에서 계속한다.
  const learn = async () => {
    if (lowRef.current) return;
    const all = ref.current.flatMap(t => t?.shots || []).filter(s => s.part);
    const picks: UIShot[] = [];
    for (const p of partsRef.current) {
      const list = all.filter(s => s.part === p.name);
      picks.push(...[...list.filter(s => s.ai !== s.part), ...list.filter(s => s.ai === s.part)].slice(0, 3));
    }
    if (!picks.length) return;
    try {
      const examples = await Promise.all(picks.map(async s => ({ part: s.part, image: await downscaleToBase64(s.y, 256, 0.7) })));
      void fetch('/api/thermal/examples', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ examples }) })
        .then(() => invalidateExamples()).catch(() => {});
    } catch { /* 학습 저장 실패는 점검표 생성에 영향 없음 */ }
  };

  // 선택한 사진 전부를 점검 폴더에 저장: root(현장 폴더)\subFolderName\약칭\[수배전반번호]
  //  · 같은 이름·크기 파일이 이미 있으면 건너뜀(재반영·같은 폴더에서 고른 경우 안전)
  //  · '폴더 선택'으로 고른 사진은 복사 크기 확인 후 원본 삭제(이동). 원본 폴더가 곧 저장 위치면 삭제 안 함
  const archivePhotos = (root: any, subFolderName: string, panelCount: number) =>
    archivePanelPhotos(root, subFolderName, ref.current.map((t, i) => ({ index: i, files: t?.files || [], source: t?.source })), panelCount);

  return {
    thermal, parts, accountParts, stationParts, stationId, lowVoltage: low, canPickFolder,
    // 현장별 설정이 있으면 그 이름(행 순서)으로 엑셀 라벨을 바꿔 적도록 전송
    b7Labels: stationParts ? stationParts.map(p => p.name) : null,
    setStationContext, saveStationParts, clearStationParts,
    addFiles, addFolder, classify, setPart, clear, reset, removeAt, buildPanels, learn, archivePhotos,
    hasAny: thermal.some(t => t?.shots.length),
    busy: thermal.some(t => t?.busy),
    unassigned: thermal.reduce((n, t) => n + (t?.shots.filter(s => !s.part).length || 0), 0),
  };
}

// 현장별 부위 편집 (한 번 저장하면 그 현장은 계속 이 목록 사용)
function StationPartsEditor({ api }: { api: ReturnType<typeof useThermalPanels> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  if (!api.stationId) return null;
  const btn: React.CSSProperties = { padding: '3px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

  const start = () => { setDraft((api.stationParts || api.accountParts).map(p => p.name).join(', ')); setMsg(''); setEditing(true); };
  const save = async () => {
    const names = draft.split(/[,，/\n]+/).map(s => s.trim()).filter(Boolean);
    if (!names.length) { setMsg('부위 이름을 하나 이상 입력해주세요'); return; }
    setSaving(true); setMsg('');
    try { await api.saveStationParts(names); setEditing(false); }
    catch (e: any) { setMsg('❌ ' + e.message); } finally { setSaving(false); }
  };
  const reset = async () => {
    if (!confirm('이 현장 전용 부위 설정을 해제할까요?\n계정 기본 부위(저압은 촬영 순서 규칙)로 돌아가고, 선택한 사진은 비워집니다.')) return;
    try { await api.clearStationParts(); } catch (e: any) { setMsg('❌ ' + e.message); }
  };

  return (
    <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 10, border: `1px dashed ${api.stationParts ? 'var(--accent)' : 'var(--border)'}`, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
      {!editing ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {api.stationParts
            ? <span>📍 <b style={{ color: 'var(--accent)' }}>이 현장 전용: {api.stationParts.map(p => p.name).join(' / ')}</b></span>
            : <span>{api.lowVoltage ? '저압 순서 규칙 사용 중' : '계정 기본 부위 사용 중'}</span>}
          <button style={btn} onClick={start}>{api.stationParts ? '변경' : '이 현장만 부위 바꾸기'}</button>
          {api.stationParts && <button style={btn} onClick={reset}>해제</button>}
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 6 }}>
          <div>위(13행)부터 순서대로, 쉼표로 구분. 예: <b>VCB, PT, CH</b></div>
          <input className="toss-input" value={draft} onChange={e => setDraft(e.target.value)} placeholder="VCB, PT, CH" style={{ fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 6 }}>
            <button style={{ ...btn, background: 'var(--accent)', color: '#fff', border: 'none' }} onClick={save} disabled={saving}>{saving ? '저장 중...' : '이 현장에 저장'}</button>
            <button style={btn} onClick={() => setEditing(false)} disabled={saving}>취소</button>
          </div>
        </div>
      )}
      {msg && <div style={{ marginTop: 4 }}>{msg}</div>}
    </div>
  );
}

export function ThermalPhotoBox({ idx, api }: { idx: number; api: ReturnType<typeof useThermalPanels> }) {
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
  const pickBtn: React.CSSProperties = { padding: '6px 12px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: th?.busy ? 'wait' : 'pointer', opacity: th?.busy ? 0.6 : 1, border: 'none', fontFamily: 'inherit' };
  return (
    <div style={{ marginTop: 14, padding: 14, borderRadius: 12, background: 'var(--bg-elevated)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        <label style={labelStyle}>🌡️ 열화상 사진 (별지7{low ? ' · 저압' : ''}) — 찍은 사진 전부 선택</label>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {shots.length > 0 && !th?.busy && (
            <>
              {!low && <button onClick={() => api.classify(idx, shots)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>🤖 다시 분류</button>}
              <button onClick={() => api.clear(idx)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✕ 비우기</button>
            </>
          )}
          {api.canPickFolder && (
            <button onClick={() => api.addFolder(idx)} disabled={th?.busy} style={pickBtn} title="사진이 들어있는 폴더를 고르면, 저장 후 사진이 점검 폴더로 옮겨집니다(원본 삭제)">📁 폴더 선택</button>
          )}
          <label style={{ ...pickBtn, background: api.canPickFolder ? 'var(--bg-card)' : 'var(--accent)', color: api.canPickFolder ? 'var(--accent)' : '#fff', border: api.canPickFolder ? '1px solid var(--accent)' : 'none' }} title="파일로 고르면 점검 폴더에 복사만 됩니다(원본 유지)">
            📷 사진 선택
            <input type="file" accept="image/jpeg,.jpg,.jpeg" multiple disabled={th?.busy} style={{ display: 'none' }} onChange={e => { api.addFiles(idx, e.target.files); e.target.value = ''; }} />
          </label>
        </div>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
        {low ? '저압: 전경 1장 + 측정 3장 순서' : `부위: ${api.parts.map(p => p.name).join(' / ')}`}
        {' · '}<a href="/guide" style={{ color: 'var(--accent)' }}>사용설명서</a>
      </div>
      {idx === 0 && <StationPartsEditor api={api} />}
      {th?.status && <div style={{ fontSize: 12.5, marginTop: 8, color: 'var(--text-secondary)' }}>{th.status}{th.source?.length ? ` · 📁 폴더에서 ${th.source.length}장 (저장 시 이동)` : ''}</div>}
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
