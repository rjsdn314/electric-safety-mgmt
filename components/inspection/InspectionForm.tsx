'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

const TYPE_OPTIONS = [
  { value: '월차', months: '1,2,4,5,7,8,12월' },
  { value: '분기', months: '3, 9월' },
  { value: '반기', months: '6월' },
  { value: '연차', months: '11월' },
];

const emptyMeasureSet = () => ({
  voltage_A: '', voltage_B: '', voltage_C: '', voltage_N: '',
  current_A: '', current_B: '', current_C: '',
  ground: '', remarks: '',
});

const norm = (s: string) => (s || '').replace(/[\s()\-_.]/g, '').toLowerCase();

export function InspectionForm() {
  const [stations, setStations] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [inspType, setInspType] = useState('월차');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [inspector, setInspector] = useState('');
  const [count, setCount] = useState(1);
  const [weather, setWeather] = useState('자동');
  const [measureSets, setMeasureSets] = useState<any[]>([emptyMeasureSet()]);
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [savedFile, setSavedFile] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [folderHandle, setFolderHandle] = useState<any>(null);
  const [folderName, setFolderName] = useState('');
  const [todayTitles, setTodayTitles] = useState<string[]>([]);
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (user) {
        const { data: profile } = await sb
          .from('profiles')
          .select('inspector_name, name, sector_id, role')
          .eq('id', user.id)
          .single();
        if (profile?.inspector_name) setInspector(profile.inspector_name);
        else if (profile?.name) setInspector(profile.name);
        let q = sb.from('stations').select('*').eq('is_active', true).order('name');
        if (profile?.role !== 'admin') q = q.eq('user_id', user.id);
        const { data } = await q;
        setStations(data || []);
      }
    };
    load();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/calendar/today');
        const j = await r.json();
        if (Array.isArray(j.titles)) setTodayTitles(j.titles);
      } catch {}
    })();
  }, []);

  const openFolderDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const req = indexedDB.open('inspection-app', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('folders'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const folderKeyByName = (station: any) => {
    const base = (station?.name || station?.base_name || '').trim();
    return 'folderByName_' + base;
  };

  const saveStationFolder = async (station: any, handle: any) => {
    try {
      const db = await openFolderDB();
      const tx = db.transaction('folders', 'readwrite');
      const store = tx.objectStore('folders');
      store.put(handle, folderKeyByName(station));
      if (station?.id) store.put(handle, 'folder_' + station.id);
    } catch (e) {}
  };

  const loadStationFolder = async (station: any) => {
    try {
      const db = await openFolderDB();
      const getOne = (key: string) => new Promise<any>((res) => {
        const tx = db.transaction('folders', 'readonly');
        const r = tx.objectStore('folders').get(key);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => res(null);
      });
      let result = await getOne(folderKeyByName(station));
      if (!result && station?.id) result = await getOne('folder_' + station.id);
      if (result) {
        try {
          const perm = await result.queryPermission({ mode: 'readwrite' });
          if (perm === 'granted' || perm === 'prompt') {
            setFolderHandle(result);
            setFolderName(result.name);
            await saveStationFolder(station, result);
            return;
          }
        } catch (e) {}
      }
      setFolderHandle(null);
      setFolderName('');
    } catch (e) { setFolderHandle(null); setFolderName(''); }
  };

  const handleSelectStation = (station: any) => {
    setSelected(station);
    setQuery(station.name);
    setOpen(false);
    const panelCount = station.panel_count && station.panel_count > 0 ? station.panel_count : 1;
    setMeasureSets(Array.from({ length: panelCount }, () => emptyMeasureSet()));
    loadStationFolder(station);
  };

  const aliasMap: Record<string, string[]> = {
    'KINTEX': ['킨텍스', '킨', '킨텍'],
    'kintex': ['킨텍스', '킨', '킨텍'],
  };

  const buildSearchTerms = (q: string): string[] => {
    if (!q) return [];
    const trimmed = q.trim();
    const lower = trimmed.toLowerCase();
    const terms = new Set<string>([trimmed, lower]);
    for (const [key, aliases] of Object.entries(aliasMap)) {
      for (const alias of aliases) {
        const aliasLower = alias.toLowerCase();
        if (alias.includes(trimmed) || aliasLower.includes(lower) || trimmed.includes(alias) || lower.includes(aliasLower)) {
          terms.add(key); terms.add(key.toLowerCase()); terms.add(key.toUpperCase());
        }
      }
      const keyLower = key.toLowerCase();
      if (keyLower.includes(lower) || lower.includes(keyLower)) {
        aliases.forEach(a => terms.add(a));
      }
    }
    return Array.from(terms);
  };

  const matchStation = (s: any, q: string): boolean => {
    if (!q) return true;
    const terms = buildSearchTerms(q);
    const haystacks = [s.name || '', s.base_name || '', (s.name || '').toLowerCase(), (s.base_name || '').toLowerCase()];
    return terms.some(term => haystacks.some(h => h.includes(term)));
  };

  // 일정 제목 ↔ 충전소명 매칭.
  //  · 한 일정에 여러 현장이 들어갈 수 있어("1일차 / 괴산휴게소(마산방향), 문경휴게소(창원방향), …")
  //    쉼표·슬래시로 구간을 나눠 구간별로 매칭한다.
  //  · "호수공원(1,2,3,4)"처럼 괄호 안 번호목록은 분리 전에 제거(제1~4주차장 모두 매칭).
  //  · 구간 매칭: 전체 포함(양방향) 또는 핵심 토큰(가장 긴 의미 토큰, 예: '영천휴게소') 일치 +
  //    의미 토큰 절반 이상 일치. 'N일차'·'오전/오후/점검' 등 불용어는 무시.
  const STOP_TOKENS = new Set(['오전', '오후', '점검', '월차', '분기', '반기', '연차', '예정', '및', '외']);
  const GENERIC_TOKENS = new Set(['주차장', '휴게소', '충전소', '공영', '제']);
  const isStopToken = (x: string) => STOP_TOKENS.has(x) || /^\d+일차$/.test(x);
  const segMatch = (seg: string, cands: string[]): boolean => {
    const nt = norm(seg);
    if (!nt) return false;
    if (cands.some(c => nt.includes(c) || c.includes(nt))) return true;   // 전체 포함(양방향)
    const tokens = seg.split(/[\s()\[\]·~-]+/).map(norm).filter(x => x.length >= 2 && !isStopToken(x));
    if (!tokens.length) return false;
    const specific = tokens.filter(x => !GENERIC_TOKENS.has(x));
    const primary = specific.sort((a, b) => b.length - a.length)[0];      // 핵심 토큰(가장 긴 의미 토큰)
    if (!primary) return false;
    return cands.some(c => {
      if (!c.includes(primary)) return false;
      const hits = tokens.filter(x => c.includes(x));
      return hits.length >= Math.max(1, Math.ceil(tokens.length * 0.5));
    });
  };
  const isTodayStation = (s: any): boolean => {
    if (!todayTitles.length) return false;
    const cands = [norm(s.name), norm(s.base_name)].filter(Boolean);
    return todayTitles.some(t => {
      const cleaned = t.replace(/\(\s*[\d,\s]+\s*\)/g, ' ');              // "(1,2,3,4)" 등 번호목록 제거
      return cleaned.split(/[,\/]+/).some(seg => segMatch(seg, cands));   // 구간별 매칭
    });
  };

  const filtered = useMemo(() => {
    const base = stations
      .filter(s => matchStation(s, query))
      .filter((s, i, arr) => arr.findIndex(x => x.name === s.name) === i);
    return [...base].sort((a, b) => {
      const ta = isTodayStation(a) ? 0 : 1;
      const tb = isTodayStation(b) ? 0 : 1;
      return ta - tb;
    });
  }, [stations, query, todayTitles]);

  const updateMeasureSet = (index: number, field: string, value: string) => {
    setMeasureSets(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addMeasureSet = () => setMeasureSets(prev => [...prev, emptyMeasureSet()]);
  const removeMeasureSet = (index: number) => {
    if (measureSets.length <= 1) return;
    setMeasureSets(prev => prev.filter((_, i) => i !== index));
  };

  const selectFolder = async () => {
    if (!selected) { alert('먼저 충전소를 선택해주세요. 충전소별로 저장 폴더가 기억됩니다.'); return; }
    if (!('showDirectoryPicker' in window)) { alert('이 기능은 데스크톱 Chrome/Edge에서만 작동합니다.'); return; }
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setFolderHandle(handle);
      setFolderName(handle.name);
      await saveStationFolder(selected, handle);
      alert(`✅ 폴더 저장 완료\\n\\n충전소: ${selected.name}\\n폴더: ${handle.name}\\n\\n이 충전소는 앞으로 항상 이 폴더에 저장됩니다.`);
    } catch (e: any) {
      if (e.name !== 'AbortError') alert('폴더 선택 실패: ' + e.message);
    }
  };

  const saveToLocal = async (base64: string, fileName: string, subFolderName: string) => {
    if (!folderHandle) return false;
    try {
      const perm = await folderHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const newPerm = await folderHandle.requestPermission({ mode: 'readwrite' });
        if (newPerm !== 'granted') { alert('폴더 쓰기 권한이 필요합니다.'); return false; }
      }
      let current = folderHandle;
      current = await current.getDirectoryHandle(subFolderName, { create: true });
      const fileHandle = await current.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      const binaryString = atob(base64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
      await writable.write(bytes);
      await writable.close();
      return true;
    } catch (e: any) {
      console.error('로컬 저장 실패:', e);
      alert('로컬 저장 실패: ' + e.message);
      return false;
    }
  };

  const handleSubmit = async () => {
    if (!selected) return alert('충전소를 선택해주세요');
    if (!inspector) return alert('점검자를 입력해주세요');
    if (!folderHandle) {
      const proceed = confirm('⚠️ 저장 폴더가 지정되지 않았습니다.\n\n폴더를 지정하지 않으면 파일이 로컬 폴더에 자동 저장되지 않고, 생성 후 직접 다운로드만 가능합니다.\n\n그래도 계속 진행하시겠습니까?');
      if (!proceed) return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/inspection/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: selected.id,
          inspection_type: inspType,
          date,
          inspector_name: inspector,
          count,
          weather,
          measure_sets: measureSets,
          ground_resistance: (inspType === '반기' || inspType === '연차') ? measureSets.map(s => s.ground) : [],
          remarks: remarks,
          is_mobile: /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error);
      if (folderHandle && r.fileBase64) {
        const dateNum = date.replace(/-/g, '');
        const subFolderName = `${dateNum}_${selected.name}_${inspType}`;
        await saveToLocal(r.fileBase64, r.fileName, subFolderName);
      }
      setSavedFile(r.fileName);
      setDownloadUrl(r.downloadUrl);
      setResult({ ...r, station: selected, inspType, date, inspector, count, weather, measureSets, remarks });
      setDone(true);
    } catch (e: any) {
      alert('오류: ' + e.message);
    } finally { setLoading(false); }
  };

  const handlePrintPdf = () => { window.print(); };

  // ── PDF 변환 도우미 연동 (데스크톱 + 저장폴더 지정 시) ──
  // 저장 폴더에 마커(.pdfonly/.pdfboth)를 만들면 PC의 "PDF 변환 도우미"
  // (바탕화면 PDF변환도우미.bat)가 감지해 실제 엑셀 모양 그대로 PDF 생성.
  const [saveMsg, setSaveMsg] = useState('');
  const writeMarker = async (kind: 'pdfonly' | 'pdfboth') => {
    if (!folderHandle || !result?.fileBase64) return false;
    const dateNum = (result.date || date).replace(/-/g, '');
    const sub = `${dateNum}_${(result.station || selected)?.name}_${result.inspType || inspType}`;
    const okx = await saveToLocal(result.fileBase64, result.fileName || savedFile, sub); // 변환 원본 보장
    if (!okx) return false;
    const dir = await folderHandle.getDirectoryHandle(sub, { create: true });
    const fh = await dir.getFileHandle(`${result.fileName || savedFile}.${kind}`, { create: true });
    const w = await fh.createWritable(); await w.write(kind); await w.close();
    return true;
  };
  const savePdf = async () => {
    if (folderHandle && result?.fileBase64) {
      try {
        const ok = await writeMarker('pdfonly');
        setSaveMsg(ok ? '🕒 PDF 변환 요청됨 — "PDF 변환 도우미"가 켜져 있으면 잠시 후 폴더에 PDF만 남습니다.' : '');
      } catch (e: any) { setSaveMsg('❌ ' + e.message); }
    } else {
      handlePrintPdf(); // 폴더 미지정/모바일: 브라우저 인쇄로 대체
    }
  };
  const saveBoth = async () => {
    if (folderHandle && result?.fileBase64) {
      try {
        const ok = await writeMarker('pdfboth');
        setSaveMsg(ok ? '🕒 엑셀 저장 + PDF 변환 요청됨 — 도우미가 켜져 있으면 잠시 후 PDF가 함께 생성됩니다.' : '');
      } catch (e: any) { setSaveMsg('❌ ' + e.message); }
    } else {
      const a = document.createElement('a'); a.href = downloadUrl; a.download = savedFile;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(handlePrintPdf, 600);
    }
  };

  const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)' };

  if (done) return (
    <>
      <div className="no-print" style={{ maxWidth: 940, margin: 0, padding: 0 }}>
        <div style={{ background: 'linear-gradient(135deg,rgba(5,192,114,.08),rgba(49,130,246,.08))', border: '1px solid rgba(5,192,114,.3)', borderRadius: 20, padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 64 }}>✅</div>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '14px 0 10px' }}>저장 완료</h2>
          <div style={{ color: 'var(--accent)', fontWeight: 600, marginBottom: 8, fontSize: 15, wordBreak: 'break-all' }}>📄 {savedFile}</div>
          {folderName && (<div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 24 }}>💾 로컬 저장: {folderName}</div>)}
          <div style={{ display: 'grid', gap: 10, maxWidth: 400, margin: '0 auto 10px' }}>
            {downloadUrl && (
              <a href={downloadUrl} download={savedFile} style={{ display: 'block', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 12, padding: '16px 24px', fontSize: 15, fontWeight: 700, textDecoration: 'none' }}>⬇️ 엑셀 저장 (.xlsx)</a>
            )}
            <button onClick={savePdf} style={{ display: 'block', width: '100%', background: 'var(--bg-elevated)', color: 'var(--text-primary)', border: '1.5px solid var(--accent)', borderRadius: 12, padding: '16px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>📄 PDF 저장{folderHandle && result?.fileBase64 ? ' (엑셀 모양 그대로)' : ' (인쇄 → PDF로 저장)'}</button>
            {downloadUrl && (
              <button onClick={saveBoth} style={{ display: 'block', width: '100%', background: 'rgba(49,130,246,.12)', color: 'var(--accent)', border: 'none', borderRadius: 12, padding: '16px 24px', fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>📦 엑셀 + PDF 저장</button>
            )}
            {saveMsg && <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{saveMsg}</div>}
            {folderHandle && result?.fileBase64 && (
              <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                PDF는 PC의 <b>“PDF 변환 도우미”</b>(바탕화면 <code>PDF변환도우미</code>)가 켜져 있을 때 실제 엑셀 모양 그대로 자동 생성됩니다.
              </div>
            )}
          </div>
          <button onClick={() => { setDone(false); setSelected(null); setQuery(''); setMeasureSets([emptyMeasureSet()]); setRemarks(''); setResult(null); }} style={{ width: '100%', maxWidth: 400, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', marginTop: 8 }}>새 점검 생성</button>
        </div>
      </div>
      {result && <PrintableSheet data={result} />}
      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #print-sheet, #print-sheet * { visibility: visible; }
          #print-sheet { position: absolute; left: 0; top: 0; width: 100%; }
          .no-print { display: none !important; }
          @page { size: A4 portrait; margin: 14mm 12mm; }
        }
        #print-sheet { display: none; }
        @media print { #print-sheet { display: block; } }
      `}</style>
    </>
  );

  return (
    <div style={{ maxWidth: 940, margin: 0, padding: 0 }}>
      <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 18, display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
        <div style={{ width: 44, height: 44, borderRadius: 12, background: folderHandle ? 'rgba(5,192,114,.15)' : 'var(--bg-elevated)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>📁</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3 }}>저장 폴더</div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folderName ? (selected ? `${folderName} / ${selected.name}` : folderName) : '⚠️ 저장 폴더가 지정되지 않았습니다 (다운로드만 가능)'}</div>
        </div>
        <button onClick={selectFolder} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, fontFamily: 'inherit' }}>{folderHandle ? '변경' : '선택'}</button>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 24, marginBottom: 14 }}>
        <div style={sectionTitle}>충전소 선택</div>
        <div style={{ position: 'relative' }}>
          <input className="toss-input" placeholder="충전소명 검색..." value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
          {open && filtered.length > 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50, background: 'var(--bg-elevated)', border: '1px solid var(--border-hover)', borderRadius: 14, padding: 6, boxShadow: '0 8px 32px rgba(0,0,0,.4)', maxHeight: 320, overflowY: 'auto' }}>
              {filtered.map(s => {
                const today = isTodayStation(s);
                return (
                  <button key={s.id} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', borderRadius: 10, border: 'none', background: today ? 'rgba(5,192,114,.08)' : 'transparent', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left' }} onClick={() => handleSelectStation(s)}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#05C072', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {today && <span style={{ marginRight: 6, fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 6, background: 'rgba(5,192,114,.18)', color: '#05a862' }}>📅 오늘</span>}
                        {s.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>{s.voltage}V · {s.capacity}kW</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'var(--accent-soft)', color: 'var(--accent)', flexShrink: 0 }}>{s.voltage >= 3000 ? '고압' : '저압'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {selected && (
          <div style={{ marginTop: 14, padding: 18, background: 'var(--bg-elevated)', borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: 'var(--accent)' }}>{selected.name}</div>
            <div style={{ display: 'flex', gap: 24, fontSize: 13, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <div><span style={{ opacity: 0.7 }}>수전전압</span> <strong style={{ color: 'var(--text-primary)', marginLeft: 6 }}>{selected.voltage}V</strong></div>
              <div><span style={{ opacity: 0.7 }}>수전용량</span> <strong style={{ color: 'var(--text-primary)', marginLeft: 6 }}>{selected.capacity}kW</strong></div>
              {selected.panel_count > 1 && (<div><span style={{ opacity: 0.7 }}>수배전반</span> <strong style={{ color: 'var(--accent)', marginLeft: 6 }}>{selected.panel_count}개</strong></div>)}
            </div>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 24, marginBottom: 14 }}>
        <div style={sectionTitle}>점검 정보</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
          {TYPE_OPTIONS.map(t => (
            <button key={t.value} onClick={() => setInspType(t.value)} style={{ padding: '16px 4px', borderRadius: 12, border: `1.5px solid ${inspType === t.value ? 'var(--accent)' : 'transparent'}`, background: inspType === t.value ? 'var(--accent-soft)' : 'var(--bg-input)', color: inspType === t.value ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 15, fontWeight: 700, cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit' }}>
              {t.value}
              <div style={{ fontSize: 11, opacity: .7, marginTop: 4, fontWeight: 500 }}>{t.months}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }} className="info-grid">
          <div><label style={labelStyle}>점검일자</label><input type="date" className="toss-input" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><label style={labelStyle}>점검자</label><input className="toss-input" placeholder="이름" value={inspector} onChange={e => setInspector(e.target.value)} /></div>
          <div><label style={labelStyle}>점검횟수</label><input type="number" className="toss-input" min={1} value={count} onChange={e => setCount(Number(e.target.value))} /></div>
          <div><label style={labelStyle}>날씨(일기)</label>
            <select className="toss-input" value={weather} onChange={e => setWeather(e.target.value)}>
              <option value="자동">자동(실제 날씨)</option>
              <option value="맑음">맑음</option>
              <option value="흐림">흐림</option>
              <option value="우천">우천</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 24, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={sectionTitle}>측정값 입력</div>
          <button onClick={addMeasureSet} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: '1.5px dashed var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ 개소 추가</button>
        </div>
        {measureSets.map((set, idx) => (
          <div key={idx} style={{ marginBottom: idx < measureSets.length - 1 ? 28 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--accent)', padding: '4px 12px', borderRadius: 8, background: 'var(--accent-soft)' }}>수배전반 #{idx + 1}</div>
              {measureSets.length > 1 && (<button onClick={() => removeMeasureSet(idx)} style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>✕ 제거</button>)}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>전압 (V)</label>
              <div className="measure-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {(['A','B','C','N'] as const).map((phase) => (
                  <div key={phase} style={{ position: 'relative' }}>
                    <input type="number" inputMode="decimal" className="toss-input" placeholder={phase === 'N' ? 'N' : `${phase}상`} style={{ paddingRight: 36 }} value={set[`voltage_${phase}`] ?? ''} onChange={e => updateMeasureSet(idx, `voltage_${phase}`, e.target.value)} />
                    <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-secondary)', pointerEvents: 'none', fontWeight: 600 }}>V</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>전류 (A)</label>
              <div className="measure-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {(['A','B','C'] as const).map((phase) => (
                  <div key={phase} style={{ position: 'relative' }}>
                    <input type="number" inputMode="decimal" className="toss-input" placeholder={`${phase}상`} style={{ paddingRight: 36 }} value={set[`current_${phase}`] ?? ''} onChange={e => updateMeasureSet(idx, `current_${phase}`, e.target.value)} />
                    <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-secondary)', pointerEvents: 'none', fontWeight: 600 }}>A</span>
                  </div>
                ))}
                <div />
              </div>
            </div>
            {(inspType === '반기' || inspType === '연차') && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>접지저항 (Ω) — 별지2-접지저항 D{5 + idx}</label>
                <div style={{ position: 'relative', maxWidth: 220 }}>
                  <input type="number" inputMode="decimal" step="0.01" className="toss-input" placeholder="측정치" style={{ paddingRight: 36 }} value={set.ground ?? ''} onChange={e => updateMeasureSet(idx, 'ground', e.target.value)} />
                  <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-secondary)', pointerEvents: 'none', fontWeight: 600 }}>Ω</span>
                </div>
              </div>
            )}
            <div>
              <label style={labelStyle}>특이사항 (수배전반 #{idx + 1})</label>
              <input className="toss-input" placeholder="특이사항이 없으면 비워두세요" value={set.remarks ?? ''} onChange={e => updateMeasureSet(idx, 'remarks', e.target.value)} />
            </div>
            {idx < measureSets.length - 1 && (<div style={{ borderTop: '1px solid var(--border)', marginTop: 20 }} />)}
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg-card)', borderRadius: 16, padding: 24, marginBottom: 14 }}>
        <label style={sectionTitle}>종합 의견(별지14)</label>
        <textarea className="toss-input" rows={3} style={{ resize: 'none' }} placeholder="특이사항이 없으면 비워두세요" value={remarks} onChange={e => setRemarks(e.target.value)} />
      </div>

      {selected && (
        <div style={{ padding: 16, background: 'var(--bg-elevated)', borderRadius: 12, fontSize: 13, marginBottom: 14 }}>
          <div style={{ color: 'var(--text-secondary)', marginBottom: 4, fontSize: 11 }}>생성될 파일</div>
          <div style={{ color: 'var(--accent)', fontWeight: 700, wordBreak: 'break-all' }}>{selected.name}_{inspType}점검_{date.replace(/-/g, '')}.xlsx</div>
        </div>
      )}

      <button onClick={handleSubmit} disabled={loading} style={{ width: '100%', padding: 18, borderRadius: 14, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 16, fontWeight: 700, cursor: 'pointer', opacity: loading ? .6 : 1, fontFamily: 'inherit' }}>{loading ? '⏳ 생성 중...' : '⚡ 직무고시 엑셀 생성 및 저장'}</button>

      <style jsx>{`
        @media (max-width: 768px) {
          .info-grid { grid-template-columns: 1fr !important; }
          .measure-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}

// ── 인쇄용 점검표 (PDF 저장 시 사용): 화면에서는 숨김, 인쇄 시에만 표시 ──
function PrintableSheet({ data }: { data: any }) {
  const st = data.station || {};
  const sets: any[] = data.measureSets || [];
  const isHighV = (st.voltage || 0) >= 3000;
  const td: React.CSSProperties = { border: '1px solid #000', padding: '4px 6px', fontSize: 12, textAlign: 'center' };
  const th: React.CSSProperties = { ...td, fontWeight: 700, background: '#f0f0f0' };
  const labelTd: React.CSSProperties = { ...td, fontWeight: 700, background: '#f7f7f7', whiteSpace: 'nowrap' };
  return (
    <div id="print-sheet" style={{ color: '#000', background: '#fff', fontFamily: 'sans-serif' }}>
      <h2 style={{ textAlign: 'center', fontSize: 20, fontWeight: 800, margin: '0 0 4px' }}>전기설비 점검표</h2>
      <div style={{ textAlign: 'center', fontSize: 13, marginBottom: 14 }}>{data.inspType}점검</div>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <tbody>
          <tr><td style={labelTd}>충전소명</td><td style={td} colSpan={3}>{st.name || '-'}</td></tr>
          <tr>
            <td style={labelTd}>수전전압</td><td style={td}>{st.voltage}V ({isHighV ? '고압' : '저압'})</td>
            <td style={labelTd}>수전용량</td><td style={td}>{st.capacity}kW</td>
          </tr>
          <tr>
            <td style={labelTd}>점검일자</td><td style={td}>{data.date}</td>
            <td style={labelTd}>점검자</td><td style={td}>{data.inspector}</td>
          </tr>
          <tr>
            <td style={labelTd}>점검횟수</td><td style={td}>{data.count}</td>
            <td style={labelTd}>날씨</td><td style={td}>{data.weather}</td>
          </tr>
        </tbody>
      </table>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
        <thead>
          <tr>
            <th style={th} rowSpan={2}>수배전반</th>
            <th style={th} colSpan={4}>전압 (V)</th>
            <th style={th} colSpan={3}>전류 (A)</th>
            {(data.inspType === '반기' || data.inspType === '연차') && <th style={th} rowSpan={2}>접지저항 (Ω)</th>}
          </tr>
          <tr>
            <th style={th}>A</th><th style={th}>B</th><th style={th}>C</th><th style={th}>N</th>
            <th style={th}>A</th><th style={th}>B</th><th style={th}>C</th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s, i) => (
            <tr key={i}>
              <td style={labelTd}>#{i + 1}</td>
              <td style={td}>{s.voltage_A}</td><td style={td}>{s.voltage_B}</td><td style={td}>{s.voltage_C}</td><td style={td}>{s.voltage_N}</td>
              <td style={td}>{s.current_A}</td><td style={td}>{s.current_B}</td><td style={td}>{s.current_C}</td>
              {(data.inspType === '반기' || data.inspType === '연차') && <td style={td}>{s.ground}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <tbody>
          {sets.map((s, i) => (
            <tr key={i}><td style={labelTd}>특이사항 #{i + 1}</td><td style={{ ...td, textAlign: 'left' }}>{s.remarks || '특이사항 없음'}</td></tr>
          ))}
          <tr><td style={labelTd}>종합의견</td><td style={{ ...td, textAlign: 'left', height: 50, verticalAlign: 'top' }}>{data.remarks || '특이사항 없음'}</td></tr>
        </tbody>
      </table>
      <div style={{ textAlign: 'right', marginTop: 24, fontSize: 13 }}>점검자: {data.inspector} (인)</div>
    </div>
  );
}
