'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Status } from '@/components/ui/Status';
import { ExternalLink, Settings } from 'lucide-react';

export default function CalendarPage() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [url, setUrl] = useState('');
  const [draft, setDraft] = useState('');
  const [icsDraft, setIcsDraft] = useState('');
  const [hasIcs, setHasIcs] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/calendar'); const j = await r.json();
        setUrl(j.url || ''); setDraft(j.url || '');
        setIcsDraft(j.icsUrl || ''); setHasIcs(!!j.hasIcs);
      }
      finally { setLoaded(true); }
    })();
  }, []);

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const r = await fetch('/api/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: draft.trim(), icsUrl: icsDraft.trim() }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '저장 실패');
      setUrl(draft.trim()); setHasIcs(!!icsDraft.trim()); setEditing(false); setMsg('✅ 저장했습니다.');
    } catch (e: any) { setMsg('❌ ' + e.message); } finally { setSaving(false); }
  };

  const input: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
  const btn = (bg: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: bg, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' });
  const btnLine: React.CSSProperties = { ...btn('var(--bg-card)'), color: 'var(--text-primary)', border: '1px solid var(--border-hover)' };

  return (
    <div className="page-pad" style={{ padding: '28px 32px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ margin: '0 0 4px' }}>캘린더</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>팀이 함께 쓰는 점검 일정입니다. 일정 수정은 구글 캘린더에서 합니다.</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {isAdmin && <button onClick={() => setEditing(v => !v)} style={btnLine}><Settings size={15} /> {editing ? '닫기' : '연결 설정'}</button>}
          <a href="https://calendar.google.com" target="_blank" rel="noopener noreferrer" style={{ ...btn('var(--accent)'), textDecoration: 'none' }}>구글 캘린더 열기 <ExternalLink size={14} /></a>
        </div>
      </div>

      {isAdmin && editing && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>구글 캘린더 삽입 주소</div>
          <input style={input} placeholder="https://calendar.google.com/calendar/embed?src=..." value={draft} onChange={e => setDraft(e.target.value)} />
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '10px 0', lineHeight: 1.7 }}>
            구글 캘린더 설정에서 해당 캘린더의 <b>캘린더 통합</b>, <b>삽입 코드</b>에 있는 <code>src="..."</code> 주소(또는 공개 URL)를 붙여 넣으세요.<br />
            팀원이 보려면 그 캘린더를 공유해 두어야 합니다.
          </div>
          <div style={{ fontSize: 13, fontWeight: 600, margin: '14px 0 8px' }}>
            iCal 비공개 주소 <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>오늘 점검할 충전소를 목록 맨 위에 보여줄 때 씁니다{hasIcs && ' (연결됨)'}</span>
          </div>
          <input style={input} placeholder="https://calendar.google.com/calendar/ical/.../private-.../basic.ics" value={icsDraft} onChange={e => setIcsDraft(e.target.value)} />
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '10px 0', lineHeight: 1.7 }}>
            구글 캘린더 설정에서 <b>iCal 형식의 비공개 주소</b>를 복사해 붙여 넣으세요. 주소는 서버에만 저장됩니다.
          </div>
          {msg && <Status msg={msg} style={{ fontSize: 13, marginBottom: 10 }} />}
          <button onClick={save} disabled={saving} style={btn(saving ? 'var(--text-tertiary)' : 'var(--accent)')}>{saving ? '저장하는 중' : '저장'}</button>
        </div>
      )}

      {!loaded ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-tertiary)' }}>불러오는 중</div>
      ) : url ? (
        <iframe src={url} title="점검 일정 캘린더" style={{ width: '100%', height: '78vh', border: '1px solid var(--border)', borderRadius: 10, background: '#fff' }} />
      ) : (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>
          {isAdmin ? '캘린더가 아직 연결되지 않았습니다. [연결 설정]에서 구글 캘린더 주소를 넣어 주세요.' : '캘린더가 아직 연결되지 않았습니다. 관리자에게 연결을 요청하세요.'}
        </div>
      )}
    </div>
  );
}
