'use client';
// ============================================================
// components/admin/TemplateManager.tsx
// 관리자: 충전소별 점검표 양식(분기/반기 공용) 등록·현황 관리
//  · 여러 파일을 한 번에 업로드 → 파일명으로 충전소 자동 매칭 미리보기 → 확정 업로드
// ============================================================
import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Row = {
  station_id: string; name: string; base_name: string;
  templates: { inspection_group: string; original_name: string; byeolji7_count: number; has_insulation: boolean; has_ground: boolean; updated_at: string; }[];
};
type Preview = { file_name: string; matched_station_id: string | null; matched_station_name: string | null; status: string; error?: string; };

export default function TemplateManager() {
  const sb = createClient();
  const [rows, setRows] = useState<Row[]>([]);
  const [registered, setRegistered] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<Preview[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [userId, setUserId] = useState('');

  const loadStatus = useCallback(async () => {
    const res = await fetch('/api/templates/list');
    const j = await res.json();
    if (j.success) { setRows(j.rows); setRegistered(j.registered); }
  }, []);

  useEffect(() => {
    sb.auth.getUser().then(({ data }) => setUserId(data.user?.id || ''));
    loadStatus();
  }, [loadStatus]);

  const buildForm = (dry: boolean) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('files', f));
    fd.append('inspection_group', '분기');
    fd.append('dry_run', dry ? 'true' : 'false');
    if (userId) fd.append('user_id', userId);
    return fd;
  };

  const doPreview = async () => {
    if (!files.length) return;
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/templates/upload', { method: 'POST', body: buildForm(true) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setPreview(j.results);
    } catch (e: any) { setMsg('❌ ' + e.message); } finally { setBusy(false); }
  };

  const doUpload = async () => {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/templates/upload', { method: 'POST', body: buildForm(false) });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error);
      setMsg(`✅ 업로드 ${j.uploaded}개 · 미매칭 ${j.unmatched}개`);
      setPreview(null); setFiles([]); loadStatus();
    } catch (e: any) { setMsg('❌ ' + e.message); } finally { setBusy(false); }
  };

  const card: React.CSSProperties = { background: 'var(--bg-card)', borderRadius: 16, padding: 24, marginBottom: 16 };
  const badge = (ok: boolean) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, background: ok ? 'rgba(16,185,129,.12)' : 'var(--bg-elevated)', color: ok ? '#059669' : 'var(--text-secondary)' });

  const matchedCount = preview?.filter((p) => p.status === 'matched').length || 0;

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: '0 24px 40px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>충전소별 양식 등록</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 20 }}>
        분기·반기 점검표 양식을 충전소별로 등록합니다. 등록 시 분기/반기 점검 생성에 자동 적용됩니다.
        (등록 {registered} / 전체 {rows.length})
      </p>

      {/* 업로드 */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>📤 양식 업로드 (여러 개 동시 선택 가능)</div>
        <input type="file" multiple accept=".xlsx"
          onChange={(e) => { setFiles(Array.from(e.target.files || [])); setPreview(null); }}
          style={{ marginBottom: 12 }} />
        {files.length > 0 && (
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
            선택된 파일 {files.length}개 — 파일명으로 충전소를 자동 매칭합니다.
          </div>
        )}
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={doPreview} disabled={busy || !files.length}
            style={{ padding: '10px 18px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text-primary)', fontWeight: 700, cursor: 'pointer' }}>
            {busy ? '확인 중…' : '① 매칭 미리보기'}
          </button>
          {preview && (
            <button onClick={doUpload} disabled={busy || matchedCount === 0}
              style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
              ② 매칭된 {matchedCount}개 업로드
            </button>
          )}
        </div>
        {msg && <div style={{ marginTop: 12, fontSize: 14 }}>{msg}</div>}
      </div>

      {/* 미리보기 */}
      {preview && (
        <div style={card}>
          <div style={{ fontWeight: 700, marginBottom: 12 }}>매칭 결과</div>
          {preview.map((p, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{p.file_name}</span>
              <span style={badge(p.status === 'matched')}>
                {p.status === 'matched' ? `→ ${p.matched_station_name}` : '⚠️ 매칭 실패 (수동 등록 필요)'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* 현황 */}
      <div style={card}>
        <div style={{ fontWeight: 700, marginBottom: 12 }}>등록 현황</div>
        {rows.map((r) => {
          const t = r.templates[0];
          return (
            <div key={r.station_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{r.name}</span>
              {t ? (
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={badge(true)}>등록됨</span>
                  별지7 {t.byeolji7_count}개 · 절연 {t.has_insulation ? '✓' : '–'} · 접지 {t.has_ground ? '✓' : '–'}
                </span>
              ) : <span style={badge(false)}>미등록</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
