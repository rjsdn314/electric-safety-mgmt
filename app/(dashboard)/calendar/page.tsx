'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function CalendarPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try { const r = await fetch('/api/calendar'); const j = await r.json(); setUrl(j.url || ''); setDraft(j.url || ''); }
      finally { setLoaded(true); }
    })();
  }, []);

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const r = await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: draft.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '저장 실패');
      setUrl(draft.trim()); setEditing(false); setMsg('✅ 저장되었습니다.');
    } catch (e: any) { setMsg('❌ ' + e.message); } finally { setSaving(false); }
  };

  const input: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'var(--bg-input, var(--bg))', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
  const btn = (bg: string): React.CSSProperties => ({ padding: '9px 16px', borderRadius: 9, border: 'none', background: bg, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' });

  return (
    <div style={{ padding: '24px 32px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 4 }}>📅 점검 일정 캘린더</h1>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>팀 공유 구글 캘린더입니다. 월별 일정을 함께 보고, 편집은 구글 캘린더에서 합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" style={{ ...btn('var(--accent, #0066ff)'), textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>구글 캘린더에서 편집 ↗</a>
          {isAdmin && <button onClick={() => setEditing(v => !v)} style={btn('#6b7280')}>{editing ? '닫기' : '캘린더 연결 설정'}</button>}
        </div>
      </div>

      {isAdmin && editing && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>구글 캘린더 임베드 주소</div>
          <input style={input} placeholder="https://calendar.google.com/calendar/embed?src=..." value={draft} onChange={e => setDraft(e.target.value)} />
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '10px 0', lineHeight: 1.7 }}>
            구글 캘린더 → 설정 → 해당 캘린더 → <b>“캘린더 통합”</b> → <b>“삽입 코드”</b> 의 <code>src="..."</code> 안 주소(또는 <b>공개 URL</b>)를 붙여넣으세요.<br />
            팀원이 보려면 그 캘린더를 <b>공유(보기/변경 권한)</b> 해두세요.
          </div>
          {msg && <div style={{ fontSize: 13, marginBottom: 10 }}>{msg}</div>}
          <button onClick={save} disabled={saving} style={btn(saving ? 'var(--border)' : 'var(--accent, #0066ff)')}>{saving ? '저장 중...' : '저장'}</button>
        </div>
      )}

      {!loaded ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-tertiary)' }}>불러오는 중…</div>
      ) : url ? (
        <iframe src={url} title="점검 일정 캘린더" style={{ width: '100%', height: '78vh', border: '1px solid var(--border)', borderRadius: 12, background: '#fff' }} />
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
          {isAdmin ? '아직 캘린더가 연결되지 않았습니다. 위 “캘린더 연결 설정”에서 구글 캘린더 임베드 주소를 넣어주세요.' : '아직 캘린더가 연결되지 않았습니다. 관리자에게 연결을 요청하세요.'}
        </div>
      )}
    </div>
  );
}
