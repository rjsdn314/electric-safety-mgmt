'use client';
// ============================================================
// components/admin/TemplateManager.tsx  (v3.1)
// 충전소별 양식 등록 — 브라우저에서 Storage로 직접 업로드(대용량 OK)
//  · 파일명으로 충전소 자동 매칭(클라이언트) + 행별 수동 지정 드롭다운
//  · 업로드: Storage 직접 → /api/templates/finalize 로 정규화·기록
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Status } from '@/components/ui/Status';
import { Upload, Loader2, Search, DraftingCompass } from 'lucide-react';
import Link from 'next/link';

type Station = { station_id: string; name: string; base_name: string; registered: boolean; groups: string[]; fromDrawing: boolean };
// 양식 상태: 연차 있음(분기·반기·연차 모두 가능) / 분기만 / 없음
type FormState = 'full' | 'partial' | 'none';
const stateOf = (s: Station): FormState => s.groups.includes('연차') ? 'full' : s.groups.length ? 'partial' : 'none';
type FileRow = { file: File; stationId: string; status: string; error?: string };

function normName(s: string): string {
  return (s || '')
    .replace(/\.[^.]+$/, '')
    .replace(/\d{6,8}\s*$/g, '')
    .replace(/\d{4}-\d{2}-\d{2}/g, '')
    .replace(/[()（）\s]/g, '')
    .replace(/(분기|반기|월차|연차|고압|저압)/g, '')
    .replace(/방향$/, '')
    .toLowerCase();
}
function autoMatch(fileName: string, stations: Station[]): string {
  const fn = normName(fileName);
  let best = '', score = 0;
  for (const st of stations) {
    for (const cand of [st.name, st.base_name]) {
      const c = normName(cand || '');
      if (!c) continue;
      let s = 0;
      if (fn === c) s = 100;
      else if (fn.includes(c) || c.includes(fn)) s = Math.min(fn.length, c.length);
      if (s > score) { score = s; best = st.station_id; }
    }
  }
  return score >= 2 ? best : '';
}

export default function TemplateManager() {
  const sb = createClient();
  const [stations, setStations] = useState<Station[]>([]);
  const [registered, setRegistered] = useState(0);
  const [rows, setRows] = useState<FileRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [userId, setUserId] = useState('');
  const [group, setGroup] = useState<'분기' | '반기' | '연차'>('연차');
  const [filter, setFilter] = useState<'all' | FormState>('all');
  const [query, setQuery] = useState('');

  const GROUP_FILE: Record<string, string> = { '분기': 'quarterly.xlsx', '반기': 'semiannual.xlsx', '연차': 'annual.xlsx' };

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/templates/list');
    const j = await res.json();
    if (j.success) {
      setStations(j.rows.map((r: any) => ({
        station_id: r.station_id, name: r.name, base_name: r.base_name,
        registered: r.templates.length > 0,
        groups: r.templates.map((t: any) => t.inspection_group),
        fromDrawing: r.templates.some((t: any) => t.inspection_group === '연차' && String(t.original_name || '').startsWith('도면 자동생성')),
      })));
      setRegistered(j.registered);
    }
  }, []);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUserId(data.user?.id || ''));
    loadStatus();
  }, [loadStatus]);

  const onPick = (fileList: FileList | null) => {
    const files = Array.from(fileList || []);
    setMsg('');
    setRows(files.map((file) => ({ file, stationId: autoMatch(file.name, stations), status: 'ready' })));
  };

  const setRowStation = (i: number, stationId: string) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, stationId } : r)));

  const matchedCount = useMemo(() => rows.filter((r) => r.stationId).length, [rows]);
  const counts = useMemo(() => ({
    all: stations.length,
    full: stations.filter((s) => stateOf(s) === 'full').length,
    partial: stations.filter((s) => stateOf(s) === 'partial').length,
    none: stations.filter((s) => stateOf(s) === 'none').length,
  }), [stations]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const order: Record<FormState, number> = { none: 0, partial: 1, full: 2 };
    return stations
      .filter((s) => filter === 'all' || stateOf(s) === filter)
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .sort((a, b) => order[stateOf(a)] - order[stateOf(b)] || a.name.localeCompare(b.name, 'ko'));
  }, [stations, filter, query]);

  const upload = async () => {
    setBusy(true); setMsg('');
    let ok = 0, fail = 0;
    const next = [...rows];
    for (let i = 0; i < next.length; i++) {
      const r = next[i];
      if (!r.stationId) { next[i] = { ...r, status: 'skip' }; continue; }
      try {
        next[i] = { ...r, status: 'uploading' }; setRows([...next]);
        const path = `${r.stationId}/${GROUP_FILE[group]}`;
        const { error: upErr } = await sb.storage.from('templates').upload(path, r.file, {
          upsert: true,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        if (upErr) throw new Error(upErr.message);
        const res = await fetch('/api/templates/finalize', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ station_id: r.stationId, original_name: r.file.name, inspection_group: group, user_id: userId }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error);
        next[i] = { ...r, status: 'done' }; ok++;
      } catch (e: any) {
        next[i] = { ...r, status: 'error', error: e.message }; fail++;
      }
      setRows([...next]);
    }
    setMsg(`${fail ? '⚠️' : '✅'} ${ok}개를 올렸습니다${fail ? `, ${fail}개 실패` : ''}.`);
    setBusy(false);
    loadStatus();
  };

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 12 };
  const sel: React.CSSProperties = { padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, maxWidth: 280, fontFamily: 'inherit' };
  const statusLabel: Record<string, string> = { ready: '대기', uploading: '올리는 중', done: '완료', error: '실패', skip: '미지정' };
  const statusColor: Record<string, string> = { done: 'var(--positive)', error: 'var(--negative)', skip: 'var(--warning)' };

  return (
    <div className="page-pad" style={{ maxWidth: 1000, padding: '28px 32px 60px' }}>
      <h1 style={{ margin: '0 0 4px' }}>양식 직접 올리기</h1>
      <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14 }}>
        도면이 없거나 이미 가진 엑셀 양식을 쓰고 싶을 때 충전소에 직접 올립니다. 연차 양식 하나만 있으면 분기, 반기 점검표도 만들어집니다. 도면이 있으면 <a href="/annual-builder" style={{ color: 'var(--accent)' }}>도면으로 만드는 것</a>이 더 간단합니다.
      </p>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>양식 올리기 <span style={{ fontWeight: 400, fontSize: 13, color: 'var(--text-tertiary)' }}>여러 개를 한 번에 고를 수 있습니다</span></div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['연차', '분기', '반기'] as const).map((g) => (
            <button key={g} type="button" disabled={busy} onClick={() => setGroup(g)}
              style={{ padding: '8px 16px', borderRadius: 8, border: `1px solid ${group === g ? 'var(--accent)' : 'var(--border)'}`, background: group === g ? 'var(--accent-soft)' : 'var(--bg-card)', color: group === g ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {g}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          보통은 연차 양식 하나만 올리면 됩니다. 분기나 반기를 따로 쓰는 현장만 그 종류로 올리세요.
        </div>
        <input type="file" multiple accept=".xlsx" disabled={busy}
          onChange={(e) => onPick(e.target.files)} style={{ marginBottom: 12 }} />
        {rows.length > 0 && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 12px' }}>
              {rows.length}개 중 {matchedCount}개를 충전소와 자동으로 맞췄습니다. 틀린 것은 직접 고르세요.
            </div>
            <div style={{ marginBottom: 14 }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.file.name}</span>
                  <select value={r.stationId} disabled={busy} onChange={(e) => setRowStation(i, e.target.value)} style={sel}>
                    <option value="">충전소 선택</option>
                    {stations.map((s) => (
                      <option key={s.station_id} value={s.station_id}>{s.name}{s.groups.includes(group) ? ` (${group} 양식 있음, 바뀜)` : ''}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 12, width: 72, textAlign: 'right', color: statusColor[r.status] || 'var(--text-secondary)' }} title={r.error || ''}>
                    {statusLabel[r.status] || r.status}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={upload} disabled={busy || matchedCount === 0}
              className="btn-primary" style={{ padding: '10px 18px', fontSize: 14 }}>
              {busy ? <><Loader2 size={16} className="spin" /> 올리는 중</> : <><Upload size={16} /> {matchedCount}개 올리기</>}
            </button>
          </>
        )}
        {msg && <Status msg={msg} style={{ marginTop: 12 }} />}
      </div>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 12 }}>등록 현황</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          {([['all', '전체', 'var(--text-secondary)'], ['none', '양식 없음', 'var(--negative)'], ['partial', '분기 양식만', 'var(--warning)'], ['full', '등록됨', 'var(--positive)']] as const).map(([k, label, color]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${filter === k ? 'var(--accent)' : 'var(--border)'}`, background: filter === k ? 'var(--accent-soft)' : 'var(--bg-card)', color: filter === k ? 'var(--accent)' : 'var(--text-secondary)',
            }}>
              {k !== 'all' && <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />}
              {label} <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>{counts[k]}</span>
            </button>
          ))}
          <div style={{ position: 'relative', marginLeft: 'auto', minWidth: 180 }}>
            <Search size={14} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="충전소 검색" style={{ ...sel, maxWidth: 'none', width: '100%', paddingLeft: 28 }} />
          </div>
        </div>
        {shown.length === 0 && <div style={{ padding: '20px 0', textAlign: 'center', fontSize: 13, color: 'var(--text-tertiary)' }}>해당하는 충전소가 없습니다.</div>}
        {shown.map((s) => {
          const st = stateOf(s);
          const badge = st === 'full'
            ? { text: s.fromDrawing ? '등록됨 · 도면' : '등록됨', bg: 'var(--positive-soft)', color: 'var(--positive)' }
            : st === 'partial'
              ? { text: `${s.groups.join(', ')} 양식만`, bg: 'var(--warning-soft)', color: 'var(--warning)' }
              : { text: '양식 없음', bg: 'var(--negative-soft)', color: 'var(--negative)' };
          return (
            <div key={s.station_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', borderTop: '1px solid var(--border)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0, background: badge.color }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
              <span style={{ padding: '2px 8px', borderRadius: 5, fontSize: 12, fontWeight: 600, background: badge.bg, color: badge.color, flexShrink: 0 }}>{badge.text}</span>
              {st !== 'full' && (
                <Link href={`/annual-builder?station=${s.station_id}`} title="도면으로 점검 양식 만들기" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7, border: '1px solid var(--border-hover)', color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}><DraftingCompass size={13} /> 도면으로</Link>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
