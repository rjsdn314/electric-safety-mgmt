'use client';
// ============================================================
// components/admin/TemplateManager.tsx  (v3.1)
// 충전소별 양식 등록 — 브라우저에서 Storage로 직접 업로드(대용량 OK)
//  · 파일명으로 충전소 자동 매칭(클라이언트) + 행별 수동 지정 드롭다운
//  · 업로드: Storage 직접 → /api/templates/finalize 로 정규화·기록
// ============================================================
import { useState, useEffect, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';

type Station = { station_id: string; name: string; base_name: string; registered: boolean };
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
  const [group, setGroup] = useState<'분기' | '반기' | '연차'>('분기');

  const GROUP_FILE: Record<string, string> = { '분기': 'quarterly.xlsx', '반기': 'semiannual.xlsx', '연차': 'annual.xlsx' };

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/templates/list');
    const j = await res.json();
    if (j.success) {
      setStations(j.rows.map((r: any) => ({
        station_id: r.station_id, name: r.name, base_name: r.base_name,
        registered: r.templates.length > 0,
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
    setMsg(`✅ 완료 ${ok}개${fail ? ` · 실패 ${fail}개` : ''}`);
    setBusy(false);
    loadStatus();
  };

  const card: React.CSSProperties = { background: 'var(--bg-card)', borderRadius: 16, padding: 24, marginBottom: 16 };
  const sel: React.CSSProperties = { padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: 13, maxWidth: 280, fontFamily: 'inherit' };
  const statusLabel: Record<string, string> = { ready: '대기', uploading: '업로드중…', done: '✅ 완료', error: '❌ 실패', skip: '⚠️ 미지정' };

  return (
    <div style={{ maxWidth: 1000, padding: '32px 36px 60px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>충전소별 양식 등록</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
        분기·반기·연차 점검표 양식을 충전소별로 등록합니다. 파일은 브라우저에서 직접 업로드되어 용량 제한이 없습니다.
        (등록 {registered} / 전체 {stations.length})
      </p>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>📤 양식 업로드 (여러 개 동시 선택 가능)</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {(['분기', '반기', '연차'] as const).map((g) => (
            <button key={g} type="button" disabled={busy} onClick={() => setGroup(g)}
              style={{ padding: '8px 18px', borderRadius: 10, border: `1.5px solid ${group === g ? 'var(--accent)' : 'var(--border)'}`, background: group === g ? 'var(--accent-soft)' : 'transparent', color: group === g ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
              {g}점검 양식{g === '분기' ? ' (접지저항 제외)' : ' (접지저항 포함)'}
            </button>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
          선택한 종별 양식으로 등록됩니다. 분기는 별지2(접지저항) 없는 양식, 반기·연차는 별지2 포함 양식을 올리세요.
        </div>
        <input type="file" multiple accept=".xlsx" disabled={busy}
          onChange={(e) => onPick(e.target.files)} style={{ marginBottom: 12 }} />
        {rows.length > 0 && (
          <>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '8px 0 12px' }}>
              선택 {rows.length}개 · 자동매칭 {matchedCount}개 — 매칭이 틀린 경우 드롭다운에서 직접 지정하세요.
            </div>
            <div style={{ marginBottom: 14 }}>
              {rows.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.file.name}</span>
                  <select value={r.stationId} disabled={busy} onChange={(e) => setRowStation(i, e.target.value)} style={sel}>
                    <option value="">— 충전소 선택 —</option>
                    {stations.map((s) => (
                      <option key={s.station_id} value={s.station_id}>{s.name}{s.registered ? ' (등록됨)' : ''}</option>
                    ))}
                  </select>
                  <span style={{ fontSize: 12, width: 72, textAlign: 'right', color: r.status === 'error' ? '#dc2626' : 'var(--text-secondary)' }} title={r.error || ''}>
                    {statusLabel[r.status] || r.status}
                  </span>
                </div>
              ))}
            </div>
            <button onClick={upload} disabled={busy || matchedCount === 0}
              style={{ padding: '11px 20px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy || matchedCount === 0 ? 0.6 : 1 }}>
              {busy ? '업로드 중…' : `지정된 ${matchedCount}개 업로드`}
            </button>
          </>
        )}
        {msg && <div style={{ marginTop: 12, fontSize: 14 }}>{msg}</div>}
      </div>

      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>등록 현황</div>
        {stations.map((s) => (
          <div key={s.station_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 14, fontWeight: 600 }}>{s.name}</span>
            <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: s.registered ? 'rgba(16,185,129,.12)' : 'var(--bg-elevated)', color: s.registered ? '#059669' : 'var(--text-secondary)' }}>
              {s.registered ? '등록됨' : '미등록'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
