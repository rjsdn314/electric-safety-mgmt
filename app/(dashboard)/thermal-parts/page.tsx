'use client';
// 계정별 열화상 촬영 부위 설정 + AI가 참고하는 내 분류 예시 관리
import { useEffect, useState } from 'react';
import { DEFAULT_PARTS, MAX_PARTS, type ThermalPart } from '@/lib/thermal/parts';

type Example = { id: number; part: string; image: string; created_at: string };

export default function ThermalPartsPage() {
  const [parts, setParts] = useState<ThermalPart[]>([]);
  const [isDefault, setIsDefault] = useState(true);
  const [examples, setExamples] = useState<Example[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [p, e] = await Promise.all([
        fetch('/api/thermal/profile', { cache: 'no-store' }).then(r => r.json()),
        fetch('/api/thermal/examples', { cache: 'no-store' }).then(r => r.json()),
      ]);
      setParts(p.parts || DEFAULT_PARTS);
      setIsDefault(!!p.is_default);
      setExamples(e.examples || []);
    } catch (err: any) { setMsg('❌ 불러오기 실패: ' + err.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const update = (i: number, field: keyof ThermalPart, v: string) =>
    setParts(prev => prev.map((p, k) => (k === i ? { ...p, [field]: v } : p)));
  const move = (i: number, d: -1 | 1) =>
    setParts(prev => { const n = [...prev]; const j = i + d; if (j < 0 || j >= n.length) return prev; [n[i], n[j]] = [n[j], n[i]]; return n; });
  const remove = (i: number) => setParts(prev => prev.filter((_, k) => k !== i));
  const add = () => setParts(prev => (prev.length >= MAX_PARTS ? prev : [...prev, { name: '', desc: '' }]));

  const save = async () => {
    setSaving(true); setMsg('');
    try {
      const r = await fetch('/api/thermal/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parts }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '저장 실패');
      setParts(j.parts); setIsDefault(false);
      setMsg('✅ 저장되었습니다. 다음 열화상 분류부터 이 부위 목록을 사용합니다.');
    } catch (e: any) { setMsg('❌ ' + e.message); } finally { setSaving(false); }
  };

  const delExample = async (q: string, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    const r = await fetch('/api/thermal/examples?' + q, { method: 'DELETE' });
    if (r.ok) setExamples((await (await fetch('/api/thermal/examples', { cache: 'no-store' })).json()).examples || []);
  };

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 20, marginBottom: 16 };
  const input: React.CSSProperties = { width: '100%', padding: '10px 12px', background: 'var(--bg-input, var(--bg))', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };
  const smallBtn: React.CSSProperties = { width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' };

  const names = parts.map(p => p.name.trim()).filter(Boolean);
  const groups = [...new Set([...names, ...examples.map(e => e.part)])];

  return (
    <div style={{ padding: '32px 36px 60px', maxWidth: 820 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>🌡️ 열화상 촬영 부위</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        내가 찍는 부위를 순서대로 적어두면 사진 분류와 엑셀 기입에 사용됩니다. <a href="/guide" style={{ color: 'var(--accent)' }}>사용설명서</a>
      </p>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 15, fontWeight: 800 }}>내 촬영 부위 {isDefault && <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-tertiary)', marginLeft: 6 }}>(기본값 사용 중)</span>}</div>
          <button onClick={() => setParts(DEFAULT_PARTS)} style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>기본값(PF/PT/CH)으로</button>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
          위에 적은 부위부터 13·15·17행 순서로 들어갑니다. 특징은 AI가 사진을 구분할 때 씁니다.
        </div>
        {loading ? <div style={{ color: 'var(--text-secondary)', fontSize: 13 }}>불러오는 중...</div> : parts.map((p, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 120px 1fr auto', gap: 8, alignItems: 'start', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--accent)', paddingTop: 10, textAlign: 'center' }}>{i + 1}</div>
            <input style={input} value={p.name} maxLength={20} placeholder="이름 (예: PF)" onChange={e => update(i, 'name', e.target.value)} />
            <textarea style={{ ...input, resize: 'vertical', minHeight: 42 }} rows={2} value={p.desc} maxLength={300} placeholder="사진상 특징 (예: 갈색 긴 원통형 퓨즈, 노란 라벨)" onChange={e => update(i, 'desc', e.target.value)} />
            <div style={{ display: 'flex', gap: 4 }}>
              <button style={smallBtn} onClick={() => move(i, -1)} title="위로">↑</button>
              <button style={smallBtn} onClick={() => move(i, 1)} title="아래로">↓</button>
              <button style={{ ...smallBtn, color: '#ef4444' }} onClick={() => remove(i)} title="삭제">✕</button>
            </div>
          </div>
        ))}
        {!loading && parts.length < MAX_PARTS && (
          <button onClick={add} style={{ marginTop: 4, padding: '8px 16px', borderRadius: 10, border: '1.5px dashed var(--accent)', background: 'var(--accent-soft)', color: 'var(--accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>+ 부위 추가</button>
        )}
      </div>

      {msg && <div style={{ ...card, padding: '12px 16px', fontSize: 14 }}>{msg}</div>}
      <button onClick={save} disabled={saving || loading} style={{ width: '100%', padding: 16, borderRadius: 12, border: 'none', background: saving ? 'var(--border)' : 'var(--accent)', color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit', marginBottom: 24 }}>{saving ? '저장 중...' : '💾 부위 목록 저장'}</button>

      <div style={card}>
        <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>AI가 참고하는 내 예시</div>
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14, lineHeight: 1.6 }}>
          반영할 때 자동으로 쌓여 다음 분류에 쓰입니다(부위별 최근 20장). 잘못 들어간 예시는 지워주세요.
        </div>
        {!loading && !examples.length && <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>아직 예시가 없습니다. 열화상을 한 번 반영하면 생깁니다.</div>}
        {groups.filter(g => examples.some(e => e.part === g)).map(g => {
          const list = examples.filter(e => e.part === g);
          const orphan = !names.includes(g);
          return (
            <div key={g} style={{ marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700 }}>{g} <span style={{ color: 'var(--text-tertiary)', fontWeight: 500 }}>{list.length}장{orphan ? ' · 현재 부위 목록에 없음(분류에 사용 안 됨)' : ''}</span></div>
                <button onClick={() => delExample('part=' + encodeURIComponent(g), `'${g}' 예시 ${list.length}장을 모두 삭제할까요?`)} style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>모두 삭제</button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                {list.map(ex => (
                  <div key={ex.id} style={{ position: 'relative', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img src={`data:image/jpeg;base64,${ex.image}`} alt={g} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block' }} />
                    <button onClick={() => delExample('id=' + ex.id)} title="이 예시 삭제" style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 11, cursor: 'pointer' }}>✕</button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
