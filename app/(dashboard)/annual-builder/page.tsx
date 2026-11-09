'use client';
// ============================================================
// app/(dashboard)/annual-builder/page.tsx
// 도면 → 연차 양식 만들기
//  1) 충전소 선택  2) 도면 PDF를 화면에 띄우고(업로드·AI 없음) 표준 구성(변압기 종류)을 골라 채움  3) 표에서 검토·수정
//  4) 이 충전소의 연차 양식으로 등록(이후 '점검 생성 > 연차'에서 자동 사용) 또는 엑셀만 받기
// ============================================================
import { useEffect, useMemo, useState } from 'react';
import { HIGH_TYPES, LOW_TYPES, buildPresetSpec, estimateChargers } from '@/lib/annual/presets';
import { readDrawingPdf, reconcile } from '@/lib/annual/drawingRead';
import { Status } from '@/components/ui/Status';
import { ScanSearch, ListChecks, FilePlus2, History, X, Plus, Copy, Dices, AlertTriangle, Check, Download, Upload, Loader2, ArrowUp, ArrowDown } from 'lucide-react';
import {
  AnnualSpec, Breaker, Panel, Transformer, HvCircuit, ChargerGroup,
  LOW_ITEMS, HIGH_ITEMS, GROUND_ITEMS, LIMITS,
  emptySpec, newTransformer, breakerDefaults, randomGround, randomInsulation,
} from '@/lib/annual/spec';

type Station = { station_id: string; name: string; annual: boolean; voltage?: number; capacity?: number };

const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 12 };
const inp: React.CSSProperties = { width: '100%', padding: '7px 9px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 7, fontSize: 13, color: 'var(--text-primary)', fontFamily: 'inherit', boxSizing: 'border-box', minWidth: 0 };
const btn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 8, border: '1px solid var(--border-hover)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontWeight: 600, fontSize: 13, cursor: 'pointer' };
const primary: React.CSSProperties = { ...btn, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff' };
const mini: React.CSSProperties = { ...btn, padding: '4px 8px', fontSize: 12, gap: 4, borderColor: 'var(--border)' };
const th: React.CSSProperties = { textAlign: 'left', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', padding: '4px 4px' };
const td: React.CSSProperties = { padding: '3px 4px', verticalAlign: 'middle' };
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 12 };
// 직접 확인해야 할 항목 — 노란 표시
const warnBox: React.CSSProperties = { background: 'var(--warning-soft)', border: '1px solid rgba(183,121,31,.55)' };
const warnInp: React.CSSProperties = { borderColor: 'rgba(183,121,31,.7)', background: 'var(--warning-soft)' };
const flag = (on: unknown) => (on ? { 'data-check': '' } : {});
function CheckTag({ text, onOk }: { text: string; onOk: () => void }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--warning)', background: 'var(--warning-soft)', border: '1px solid rgba(183,121,31,.4)', borderRadius: 6, padding: '2px 3px 2px 8px' }}>
      <AlertTriangle size={13} /> {text}
      <button onClick={onOk} title="확인했으면 눌러서 표시를 지웁니다" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, border: 'none', background: 'var(--warning)', color: '#fff', borderRadius: 4, padding: '2px 7px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}><Check size={11} strokeWidth={3} />확인</button>
    </span>
  );
}
const hint: React.CSSProperties = { fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10, lineHeight: 1.5 };

function download(b64: string, name: string) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  const url = URL.createObjectURL(new Blob([arr], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export default function AnnualBuilderPage() {
  const [stations, setStations] = useState<Station[]>([]);
  const [stationId, setStationId] = useState('');
  const [spec, setSpec] = useState<AnnualSpec | null>(null);
  const [savedSpec, setSavedSpec] = useState<AnnualSpec | null>(null);
  const [pdfs, setPdfs] = useState<{ name: string; url: string; file: File }[]>([]);
  const [pdfIdx, setPdfIdx] = useState(0);
  const [low, setLow] = useState(false);
  const [systems, setSystems] = useState<{ typeId: string; spdPoles: 3 | 4; feeders?: Breaker[]; size?: number }[]>([{ typeId: 'h850', spdPoles: 4 }]);
  const [ch200, setCh200] = useState(1);
  const [ch350, setCh350] = useState(3);
  const [commBoxes, setCommBoxes] = useState(1);
  const [prefix, setPrefix] = useState('2');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const [warnings, setWarnings] = useState<string[]>([]);
  const [openGround, setOpenGround] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/templates/list').then((r) => r.json()).then((j) => {
      if (!j.success) return;
      const list: Station[] = j.rows.map((r: any) => ({
        station_id: r.station_id, name: r.name, voltage: Number(r.voltage) || undefined, capacity: Number(r.capacity) || undefined,
        annual: r.templates.some((t: any) => t.inspection_group === '연차'),
      }));
      setStations(list);
      // 관리구역에서 넘어온 경우(?station=ID) 그 충전소를 바로 선택
      const want = new URLSearchParams(window.location.search).get('station');
      if (want && list.some((s) => s.station_id === want)) setStationId(want);
    });
  }, []);

  useEffect(() => {
    setSpec(null); setSavedSpec(null); setMsg(''); setWarnings([]);
    if (!stationId) return;
    fetch(`/api/annual/build?station_id=${stationId}`).then((r) => r.json()).then((j) => { if (j.spec) setSavedSpec(j.spec); });
  }, [stationId]);

  const station = useMemo(() => stations.find((s) => s.station_id === stationId), [stations, stationId]);
  // 충전소의 수전전압으로 고압/저압 기본 선택 (관리구역에 등록한 값)
  useEffect(() => {
    if (station?.voltage) setLowMode(station.voltage < 1000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [station?.station_id]);
  const upd = (fn: (s: AnnualSpec) => void) => setSpec((prev) => { if (!prev) return prev; const n = structuredClone(prev); fn(n); return n; });

  // 도면 PDF는 서버로 올리지 않고 브라우저에서만 띄워 본다 (AI·크레딧 사용 없음)
  const pickPdfs = (files: File[]) => {
    pdfs.forEach((f) => URL.revokeObjectURL(f.url));
    setPdfs(files.map((f) => ({ name: f.name, url: URL.createObjectURL(f), file: f }))); setPdfIdx(0);
  };
  const types = low ? LOW_TYPES : HIGH_TYPES;
  const setLowMode = (v: boolean) => {
    setLow(v);
    setSystems([{ typeId: v ? 'l210' : 'h850', spdPoles: 4 }, ...(v ? [{ typeId: 'l367', spdPoles: 4 as const }] : [])]);
    if (v) { setCh200(1); setCh350(1); } else { setCh200(1); setCh350(3); }
  };
  const applyPreset = () => {
    if (spec && !confirm('지금 입력한 내용을 표준 구성으로 덮어쓸까요?')) return;
    setSpec(buildPresetSpec({ low, systems, commBoxes, ch200, ch350, prefix, stationLabel: station?.name || '' }));
    setMsg('✅ 표준 구성으로 채웠습니다. 도면과 다른 부분만 고친 뒤 등록하세요.'); setWarnings([]);
  };

  // 도면 글자를 브라우저 안에서 OCR로 읽어 변압기 용량·간선 차단기를 채운다 (무료)
  const readDrawings = async () => {
    if (!pdfs.length) return;
    if (spec && !confirm('지금 입력한 내용을 도면에서 읽은 내용으로 덮어쓸까요?')) return;
    setMsg(''); setWarnings([]);
    try {
      const recs = [];
      for (let i = 0; i < pdfs.length; i++) {
        setBusy(`도면 읽는 중 (${i + 1}/${pdfs.length}). 처음 한 번은 조금 더 걸립니다.`);
        const r = await readDrawingPdf(pdfs[i].file, prefix, (st) => setBusy(`도면 읽는 중 (${i + 1}/${pdfs.length}): ${st}`));
        recs.push({ read: r, rec: reconcile(r, prefix) });
      }
      const isLow = recs.filter((x) => x.read.low).length > recs.length / 2;
      const use = recs.filter((x) => x.read.low === isLow).slice(0, LIMITS.transformers);
      const sys = use.map(({ rec }) => ({ typeId: rec.typeId, spdPoles: rec.spdPoles, feeders: rec.feeders, size: rec.size || undefined }));
      const [c200, c350] = estimateChargers(isLow, sys.map((x) => x.typeId));
      const boxes = isLow ? 1 : sys.length;
      setLow(isLow); setSystems(sys); setCh200(c200); setCh350(c350); setCommBoxes(boxes);
      const s = buildPresetSpec({ low: isLow, systems: sys, commBoxes: boxes, ch200: c200, ch350: c350, prefix, stationLabel: station?.name || '' });
      s.notes = [
        ...use.map((x) => x.rec.note),
        ...recs.filter((x) => !use.includes(x)).map((x) => `${x.read.fileName}: ${recs.length > LIMITS.transformers ? '변압기 최대 3대라 제외' : '수전 방식(고압/저압)이 달라 제외'}했습니다.`),
        `충전기 대수(200kW ${c200}대 · 350kW ${c350}대)와 통신함 수는 변압기 종류로 추정한 값이에요 — 실제와 다르면 고쳐 주세요.`,
      ];
      setSpec(s);
      setMsg('✅ 도면을 읽어 채웠습니다. 노란색으로 표시한 칸을 도면과 비교한 뒤 등록하세요.');
    } catch (e: any) { setMsg('❌ 도면을 읽지 못했습니다. 표준 구성을 골라 채워 주세요. (' + (e?.message || e) + ')'); }
    finally { setBusy(''); }
  };

  const startManual = () => {
    const s = emptySpec(); s.station_label = station?.name || ''; setSpec(s); setMsg(''); setWarnings([]);
  };

  const build = async (save: boolean) => {
    if (!spec) return;
    if (save && checkCount > 0 && !confirm(`노란색으로 표시한 확인할 항목이 ${checkCount}개 남아 있습니다. 그대로 등록할까요?`)) return;
    if (save && station?.annual && !confirm(`${station.name}에 이미 점검 양식이 있습니다. 새 양식으로 바꿀까요?`)) return;
    setBusy(save ? '양식 등록 중…' : '엑셀 만드는 중…'); setMsg('');
    try {
      const r = await fetch('/api/annual/build', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ station_id: stationId, spec, save }) });
      const j = await r.json().catch(() => ({ error: `서버 응답 오류 (${r.status})` }));
      if (!r.ok) throw new Error(j.error || '생성 실패');
      setWarnings(j.warnings || []);
      download(j.fileBase64, j.fileName);
      if (save) {
        setMsg('✅ 점검 양식으로 등록했습니다. 이제 분기, 반기, 연차 점검표를 만들 때 이 양식이 쓰입니다.');
        setStations((prev) => prev.map((s) => (s.station_id === stationId ? { ...s, annual: true } : s)));
        setSavedSpec(spec);
      } else setMsg('✅ 엑셀을 내려받았습니다. 등록은 하지 않았습니다.');
    } catch (e: any) { setMsg('❌ ' + e.message); }
    finally { setBusy(''); }
  };

  // ── 편집 도우미 ──
  const setTr = (i: number, k: keyof Transformer, v: any) => upd((s) => { (s.transformers[i] as any)[k] = v; });
  const setPanel = (i: number, k: keyof Panel, v: any) => upd((s) => { (s.panels[i] as any)[k] = v; });
  const setBr = (pi: number, bi: number, k: keyof Breaker, v: string) => upd((s) => {
    const b = s.panels[pi].breakers[bi];
    (b as any)[k] = v; delete b.check;
    if (k === 'spec') { const d = breakerDefaults(v); b.voltage = d.voltage; b.value = d.value; }
  });
  const movePanel = (i: number, d: -1 | 1) => upd((s) => { const j = i + d; if (j < 0 || j >= s.panels.length) return; [s.panels[i], s.panels[j]] = [s.panels[j], s.panels[i]]; });
  const setHv = (i: number, k: keyof HvCircuit, v: string) => upd((s) => { (s.hv_circuits[i] as any)[k] = v; delete s.check_hv; });
  const setCh = (i: number, k: keyof ChargerGroup, v: any) => upd((s) => { (s.chargers[i] as any)[k] = v; delete s.chargers[i].check; });

  const breakerCount = spec?.panels.reduce((n, p) => n + p.breakers.length, 0) || 0;
  const checkCount = spec ? spec.panels.reduce((n, p) => n + (p.check ? 1 : 0) + p.breakers.filter((b) => b.check).length, 0)
    + spec.chargers.filter((c) => c.check).length + (spec.check_hv ? 1 : 0) : 0;
  const goFirstCheck = () => document.querySelector('[data-check]')?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <div className="page-pad" style={{ maxWidth: 1100, padding: '28px 32px 80px' }}>
      <h1 style={{ margin: '0 0 4px' }}>도면으로 양식 만들기</h1>
      <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14 }}>
        설계도면 PDF를 읽어 변압기, 분전반 차단기, 충전기를 채운 뒤 그 충전소의 점검 양식으로 등록합니다. 이 양식 하나로 분기, 반기, 연차 점검표를 모두 만듭니다.
      </p>

      <div style={card}>
        <div style={h2}>1. 충전소와 도면</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, alignItems: 'end' }}>
          <label style={{ fontSize: 13 }}>충전소
            <select value={stationId} onChange={(e) => setStationId(e.target.value)} style={{ ...inp, marginTop: 4 }} disabled={!!busy}>
              <option value="">충전소 선택</option>
              {stations.map((s) => <option key={s.station_id} value={s.station_id}>{s.name}{s.annual ? ' (양식 있음)' : ''}</option>)}
            </select>
          </label>
          <label style={{ fontSize: 13 }}>설계도면 PDF (여러 개 가능)
            <input type="file" multiple accept="application/pdf,.pdf" disabled={!!busy} onChange={(e) => pickPdfs(Array.from(e.target.files || []))} style={{ ...inp, marginTop: 4 }} />
          </label>
          <label style={{ fontSize: 13 }}>차단기 표기 앞 번호
            <input value={prefix} onChange={(e) => setPrefix(e.target.value)} style={{ ...inp, marginTop: 4 }} placeholder="예: 2 (2MCCB4P350A)" disabled={!!busy} />
          </label>
        </div>

        {pdfs.length > 0 && (
          <div style={{ marginTop: 14 }}>
            {pdfs.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                {pdfs.map((f, i) => <button key={f.url} style={{ ...mini, borderColor: i === pdfIdx ? 'var(--accent)' : 'var(--border)', color: i === pdfIdx ? 'var(--accent)' : 'var(--text-primary)' }} onClick={() => setPdfIdx(i)}>{f.name}</button>)}
              </div>
            )}
            <div style={hint}>변압기 용량과 저압 간선은 단선결선도(보통 3쪽)에서 확인할 수 있습니다.</div>
            <iframe src={pdfs[pdfIdx]?.url} title="도면" style={{ width: '100%', height: 560, border: '1px solid var(--border)', borderRadius: 10, background: '#fff' }} />
          </div>
        )}

        <div style={{ marginTop: 16, padding: 14, background: 'var(--bg-elevated)', borderRadius: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>표준 구성 <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: 13 }}>도면을 읽으면 자동으로 맞춰집니다</span></div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, marginBottom: 10 }}>
            <label><input type="radio" checked={!low} onChange={() => setLowMode(false)} /> 고압 수전 (22.9kV, 변압기)</label>
            <label><input type="radio" checked={low} onChange={() => setLowMode(true)} /> 저압 수전 (380V, 한전 공급 계통)</label>
          </div>
          {systems.map((sys, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 700, width: 44 }}>SS-{i + 1}</span>
              <select style={{ ...inp, flex: 1, minWidth: 260 }} value={sys.typeId} onChange={(e) => setSystems((p) => p.map((x, j) => (j === i ? { typeId: e.target.value, spdPoles: x.spdPoles } : x)))}>
                {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              {sys.feeders && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }} title="도면 간선표에서 읽은 차단기를 씁니다. 종류를 바꾸면 표준 구성으로 바뀝니다.">도면에서 읽음</span>}
              {!low && (
                <label style={{ fontSize: 12 }}>SPD 차단기
                  <select style={{ ...inp, width: 70, display: 'inline-block', marginLeft: 4 }} value={sys.spdPoles} onChange={(e) => setSystems((p) => p.map((x, j) => (j === i ? { ...x, spdPoles: +e.target.value as 3 | 4 } : x)))}>
                    <option value={4}>4P</option><option value={3}>3P</option>
                  </select>
                </label>
              )}
              {systems.length > 1 && <button style={mini} aria-label="삭제" onClick={() => setSystems((p) => p.filter((_, j) => j !== i))}><X size={13} /></button>}
            </div>
          ))}
          {systems.length < LIMITS.transformers && (
            <button style={{ ...mini, marginBottom: 10 }} onClick={() => setSystems((p) => [...p, { typeId: types[0].id, spdPoles: 4 }])}><Plus size={13} /> {low ? '수전 계통' : '변압기'} 추가</button>
          )}
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 13, alignItems: 'center' }}>
            <label>200kW 충전기 <input type="number" min={0} style={{ ...inp, width: 64, display: 'inline-block' }} value={ch200} onChange={(e) => setCh200(+e.target.value)} />대</label>
            <label>350kW 충전기 <input type="number" min={0} style={{ ...inp, width: 64, display: 'inline-block' }} value={ch350} onChange={(e) => setCh350(+e.target.value)} />대</label>
            <label>통신함 <input type="number" min={0} style={{ ...inp, width: 64, display: 'inline-block' }} value={commBoxes} onChange={(e) => setCommBoxes(+e.target.value)} />개</label>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
          <button style={{ ...primary, opacity: !stationId || !pdfs.length || busy ? 0.5 : 1 }} disabled={!stationId || !pdfs.length || !!busy} onClick={readDrawings}><ScanSearch size={15} /> 도면 읽어서 채우기{pdfs.length > 1 ? ` (${pdfs.length}개)` : ''}</button>
          <button style={btn} disabled={!stationId || !!busy} onClick={applyPreset}><ListChecks size={15} /> 고른 구성으로 채우기</button>
          <button style={btn} disabled={!stationId || !!busy} onClick={startManual}><FilePlus2 size={15} /> 빈 양식으로 시작</button>
          {savedSpec && <button style={btn} disabled={!!busy} onClick={() => { setSpec(structuredClone(savedSpec)); setMsg('이전에 등록한 설비 내용을 불러왔습니다.'); }}><History size={15} /> 이전 등록 내용</button>}
        </div>
        {busy && <Status msg={busy} kind="busy" style={{ marginTop: 12 }} />}
        {!busy && msg && <Status msg={msg} style={{ marginTop: 12 }} />}
        {warnings.length > 0 && (
          <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>{warnings.map((w, i) => <Status key={i} msg={w} kind="warn" style={{ fontSize: 13 }} />)}</div>
        )}
      </div>

      {spec && (
        <>
          {spec.notes.length > 0 && (
            <div style={{ ...card, borderColor: 'rgba(183,121,31,.55)' }}>
              <div style={h2}>확인할 부분</div>
              {checkCount > 0 && (
                <div style={{ fontSize: 13, marginBottom: 8 }}>아래 표에서 <b style={{ color: 'var(--warning)' }}>노란색으로 표시한 {checkCount}곳</b>은 도면에서 확실히 읽지 못했거나 추정한 값입니다. 맞으면 [확인]을 누르고, 틀리면 고치면 표시가 사라집니다.{' '}
                  <button style={mini} onClick={goFirstCheck}>첫 항목으로 이동</button></div>
              )}
              <ul style={{ paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>{spec.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
            </div>
          )}

          <div style={card}>
            <div style={h2}>2. 기본 사항</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
              <label style={{ fontSize: 13 }}>설비명(상호)<input style={{ ...inp, marginTop: 4 }} value={spec.station_label} onChange={(e) => upd((s) => { s.station_label = e.target.value; })} /></label>
              <label style={{ fontSize: 13 }}>수전전압(V)<input style={{ ...inp, marginTop: 4 }} type="number" value={spec.supply_voltage} onChange={(e) => upd((s) => { s.supply_voltage = +e.target.value; })} /></label>
              <label style={{ fontSize: 13 }}>수전용량(kW)<input style={{ ...inp, marginTop: 4 }} type="number" value={spec.capacity_kw} onChange={(e) => upd((s) => { s.capacity_kw = +e.target.value; })} /></label>
            </div>
          </div>

          <div style={card}>
            <div style={h2}>3. 별지1 설비 해당 여부</div>
            <div style={hint}>눌러서 ○(해당) / /(해당 없음)을 바꿉니다.</div>
            {([['저압 설비', LOW_ITEMS, 'marks_low'], ['특고(고압) 설비', HIGH_ITEMS, 'marks_high']] as const).map(([title, items, key]) => (
              <div key={key} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>{title}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {items.map((it) => {
                    const v = spec[key][it.key] || '/';
                    return (
                      <button key={it.key} onClick={() => upd((s) => { s[key][it.key] = v === '○' ? '/' : '○'; })}
                        style={{ ...mini, background: v === '○' ? 'var(--accent-soft)' : 'transparent', color: v === '○' ? 'var(--accent)' : 'var(--text-secondary)', borderColor: v === '○' ? 'var(--accent)' : 'var(--border)' }}>
                        {v} {it.key}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div style={card}>
            <div style={h2}>4. 변압기 ({spec.transformers.length}대)</div>
            <div style={hint}>변압기 1대 = 별지7 시트 1장 · 별지1 측정개소 1칸 · 전원품질 1블록. 최대 {LIMITS.transformers}대. 최대전력·역률은 매년 같은 값을 쓰면 입력해 두세요.</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 860 }}>
                <thead><tr>{['용량(kVA)', '상', '전압', '제작사', '제작번호', '유량(K열)', '설치장소', '최대전력', '역률', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {spec.transformers.map((t, i) => (
                    <tr key={i}>
                      <td style={td}><input style={inp} type="number" value={t.kva} onChange={(e) => setTr(i, 'kva', +e.target.value)} /></td>
                      <td style={td}><input style={inp} value={t.phase} onChange={(e) => setTr(i, 'phase', e.target.value)} /></td>
                      <td style={td}><input style={inp} value={t.volt} onChange={(e) => setTr(i, 'volt', e.target.value)} /></td>
                      <td style={td}><input style={inp} value={t.maker} onChange={(e) => setTr(i, 'maker', e.target.value)} /></td>
                      <td style={td}><input style={inp} value={t.serial} onChange={(e) => setTr(i, 'serial', e.target.value)} /></td>
                      <td style={td}><input style={inp} value={t.oil} onChange={(e) => setTr(i, 'oil', e.target.value)} /></td>
                      <td style={td}><input style={inp} value={t.location} onChange={(e) => setTr(i, 'location', e.target.value)} /></td>
                      <td style={td}><input style={inp} value={t.max_kw} onChange={(e) => setTr(i, 'max_kw', e.target.value)} /></td>
                      <td style={td}><input style={inp} value={t.pf} onChange={(e) => setTr(i, 'pf', e.target.value)} /></td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <button style={mini} onClick={() => setOpenGround(openGround === i ? null : i)}>접지</button>{' '}
                        <button style={mini} onClick={() => upd((s) => { s.transformers.splice(i, 1); })}>삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {openGround !== null && spec.transformers[openGround] && (
              <div style={{ marginTop: 10, padding: 12, background: 'var(--bg-elevated)', borderRadius: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>고압 접지저항 표 — {spec.transformers[openGround].kva}kVA</div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['설비', '접지선 종류·굵기', '기준치(Ω)', '측정치(Ω)'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {spec.transformers[openGround].ground.map((g, gi) => (
                      <tr key={gi}>
                        <td style={{ ...td, fontSize: 13 }}>{GROUND_ITEMS[gi]}</td>
                        {(['wire', 'standard', 'value'] as const).map((k) => (
                          <td key={k} style={td}><input style={inp} value={g[k]} onChange={(e) => upd((s) => { s.transformers[openGround].ground[gi][k] = e.target.value; })} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <button style={{ ...mini, marginTop: 10 }} disabled={spec.transformers.length >= LIMITS.transformers} onClick={() => upd((s) => { s.transformers.push(newTransformer()); })}><Plus size={13} /> 변압기 추가</button>
          </div>

          <div style={card}>
            <div style={h2}>5. 저압 분전반 · 차단기 ({spec.panels.length}개 반 / 차단기 {breakerCount}개)</div>
            <div style={hint}>별지2 절연저항 표에 반 이름과 차단기 순서대로 들어가고, 접지저항 표에는 반마다 한 줄이 생깁니다.
              절연저항 측정치는 단상(1, 2극) 10~14, 3상(3, 4극) 400~999 사이에서 정해집니다.</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12, fontSize: 13 }}>
              <label>접지저항 측정치(전 분전반 같은 값)
                <input style={{ ...inp, width: 80, display: 'inline-block', marginLeft: 6 }} value={spec.ground_value || ''} onChange={(e) => upd((s) => { s.ground_value = e.target.value; })} /> Ω
              </label>
              <button style={mini} onClick={() => upd((s) => { s.ground_value = randomGround(); })}><Dices size={13} /> 접지저항 다시 정하기</button>
              <button style={mini} onClick={() => upd((s) => { s.panels.forEach((p) => p.breakers.forEach((b) => { b.value = randomInsulation(b.spec); })); })}><Dices size={13} /> 절연저항 다시 정하기</button>
            </div>
            {spec.panels.map((p, pi) => (
              <div key={pi} {...flag(p.check)} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10, ...(p.check ? warnBox : {}) }}>
                {p.check && <div style={{ marginBottom: 8 }}><CheckTag text={p.check} onOk={() => upd((s) => { delete s.panels[pi].check; })} /></div>}
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                  <input style={{ ...inp, width: 160, fontWeight: 700 }} value={p.name} onChange={(e) => setPanel(pi, 'name', e.target.value)} />
                  <label style={{ fontSize: 12 }}>접지 사용전압 <input style={{ ...inp, width: 90, display: 'inline-block' }} value={p.voltage} onChange={(e) => setPanel(pi, 'voltage', e.target.value)} /></label>
                  <label style={{ fontSize: 12 }}><input type="checkbox" checked={p.ground} onChange={(e) => setPanel(pi, 'ground', e.target.checked)} /> 접지저항 측정</label>
                  <span style={{ flex: 1 }} />
                  <button style={mini} aria-label="위로" onClick={() => movePanel(pi, -1)}><ArrowUp size={13} /></button>
                  <button style={mini} aria-label="아래로" onClick={() => movePanel(pi, 1)}><ArrowDown size={13} /></button>
                  <button style={mini} onClick={() => upd((s) => { s.panels.splice(pi, 1); })}>반 삭제</button>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['차단기', '사용전압', '측정치', '비고', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {p.breakers.map((b, bi) => (
                      <tr key={bi} {...flag(b.check)}>
                        <td style={td}><input style={{ ...inp, ...(b.check ? warnInp : {}) }} title={b.check} value={b.spec} onChange={(e) => setBr(pi, bi, 'spec', e.target.value)} /></td>
                        <td style={td}><input style={inp} value={b.voltage} onChange={(e) => setBr(pi, bi, 'voltage', e.target.value)} /></td>
                        <td style={td}><input style={inp} value={b.value} onChange={(e) => setBr(pi, bi, 'value', e.target.value)} /></td>
                        <td style={td}><input style={inp} value={b.remark} onChange={(e) => setBr(pi, bi, 'remark', e.target.value)} /></td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>
                          {b.check && <><CheckTag text={b.check} onOk={() => upd((s) => { delete s.panels[pi].breakers[bi].check; })} />{' '}</>}
                          <button style={mini} title="복제" aria-label="복제" onClick={() => upd((s) => { s.panels[pi].breakers.splice(bi + 1, 0, { ...b }); })}><Copy size={13} /></button>{' '}
                          <button style={mini} title="삭제" aria-label="삭제" onClick={() => upd((s) => { s.panels[pi].breakers.splice(bi, 1); })}><X size={13} /></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button style={{ ...mini, marginTop: 6 }} onClick={() => upd((s) => { { const sp = `${prefix}MCCB4P50A`; s.panels[pi].breakers.push({ spec: sp, ...breakerDefaults(sp), remark: '' }); } })}><Plus size={13} /> 차단기</button>
              </div>
            ))}
            <button style={mini} onClick={() => upd((s) => { s.panels.push({ name: `SS-${s.panels.length + 1}`, voltage: '380/220', ground: true, breakers: [] }); })}><Plus size={13} /> 분전반 추가</button>
          </div>

          <div {...flag(spec.check_hv)} style={{ ...card, ...(spec.check_hv ? warnBox : {}) }}>
            <div style={h2}>6. 고압 기기절연 측정 구간</div>
            {spec.check_hv && <div style={{ marginBottom: 8 }}><CheckTag text={spec.check_hv} onOk={() => upd((s) => { delete s.check_hv; })} /></div>}
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 760 }}>
                <thead><tr>{['측정회로 및 기기', '전선-대지', 'A-B', 'B-C', 'C-A', '결과', '비고', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {spec.hv_circuits.map((c, i) => (
                    <tr key={i}>
                      {(['name', 'insul', 'ab', 'bc', 'ca', 'result', 'remark'] as const).map((k) => (
                        <td key={k} style={td}><input style={inp} value={c[k]} onChange={(e) => setHv(i, k, e.target.value)} /></td>
                      ))}
                      <td style={td}><button style={mini} aria-label="삭제" onClick={() => upd((s) => { s.hv_circuits.splice(i, 1); })}><X size={13} /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button style={{ ...mini, marginTop: 6 }} disabled={spec.hv_circuits.length >= LIMITS.hvCircuits} onClick={() => upd((s) => { s.hv_circuits.push({ name: '', insul: '2000', ab: '0', bc: '0', ca: '0', result: '적 합', remark: '' }); })}><Plus size={13} /> 구간 추가</button>
          </div>

          <div style={card}>
            <div style={h2}>7. 충전기 (별지14)</div>
            <table style={{ width: '100%', maxWidth: 760, borderCollapse: 'collapse' }}>
              <thead><tr>{['용량(kW)', '대수', '모델명', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {spec.chargers.map((c, i) => (
                  <tr key={i} {...flag(c.check)}>
                    <td style={td}><input style={inp} type="number" value={c.kw} onChange={(e) => setCh(i, 'kw', +e.target.value)} /></td>
                    <td style={td}><input style={{ ...inp, ...(c.check ? warnInp : {}) }} title={c.check} type="number" value={c.count} onChange={(e) => setCh(i, 'count', +e.target.value)} /></td>
                    <td style={td}><input style={inp} value={c.model} onChange={(e) => setCh(i, 'model', e.target.value)} /></td>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{c.check && <><CheckTag text={c.check} onOk={() => upd((s) => { delete s.chargers[i].check; })} />{' '}</>}<button style={mini} aria-label="삭제" onClick={() => upd((s) => { s.chargers.splice(i, 1); })}><X size={13} /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button style={{ ...mini, marginTop: 6 }} onClick={() => upd((s) => { s.chargers.push({ kw: 200, count: 1, model: 'CS20A3' }); })}><Plus size={13} /> 충전기 종류 추가</button>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 14, alignItems: 'center', fontSize: 13 }}>
              <label>제조사 <input style={{ ...inp, width: 140, display: 'inline-block' }} value={spec.charger_maker} onChange={(e) => upd((s) => { s.charger_maker = e.target.value; })} /></label>
              <span>설치위치 {(['옥내', '옥외', '기타'] as const).map((l) => (
                <label key={l} style={{ marginLeft: 8 }}><input type="radio" checked={spec.charger_location === l} onChange={() => upd((s) => { s.charger_location = l; })} /> {l}</label>
              ))}</span>
              <span>충전형식 {([['chademo', 'DC차데모'], ['combo', 'DC콤보'], ['ac3', 'AC3상']] as const).map(([k, l]) => (
                <label key={k} style={{ marginLeft: 8 }}><input type="checkbox" checked={spec.charger_types[k]} onChange={(e) => upd((s) => { s.charger_types[k] = e.target.checked; })} /> {l}</label>
              ))}</span>
            </div>
          </div>

          <div style={{ ...card, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', position: 'sticky', bottom: 12, boxShadow: 'var(--shadow-lg)' }}>
            <button style={{ ...primary, opacity: busy ? 0.6 : 1 }} disabled={!!busy} onClick={() => build(true)}><Upload size={15} /> 이 충전소 점검 양식으로 등록</button>
            <button style={btn} disabled={!!busy} onClick={() => build(false)}><Download size={15} /> 엑셀만 내려받기</button>
            {checkCount > 0
              ? <button style={{ ...btn, borderColor: 'rgba(183,121,31,.55)', color: 'var(--warning)' }} onClick={goFirstCheck}><AlertTriangle size={15} /> 확인할 칸 {checkCount}개</button>
              : <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>등록하면 엑셀도 함께 내려받습니다.</span>}
          </div>
        </>
      )}
    </div>
  );
}
