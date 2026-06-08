'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SignaturePage() {
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [current, setCurrent] = useState<string | null>(null); // 등록된 서명
  const [preview, setPreview] = useState<string | null>(null);  // 저장 전 미리보기
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  // 로그인 사용자의 점검자 이름 기본값
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: p } = await sb.from('profiles').select('inspector_name, name').eq('id', user.id).single();
      const n = p?.inspector_name || p?.name || '';
      setName(n);
    })();
  }, []);

  // 이름이 정해지면 등록된 서명 조회
  useEffect(() => {
    if (!name.trim()) { setCurrent(null); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/signature?name=' + encodeURIComponent(name.trim()));
        const j = await r.json();
        setCurrent(j.signature || null);
      } catch {}
    }, 300);
    return () => clearTimeout(t);
  }, [name]);

  // 캔버스 초기화
  const clearCanvas = () => {
    const c = canvasRef.current; if (!c) return;
    const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, c.width, c.height);
    setPreview(null);
  };
  useEffect(() => { if (mode === 'draw') clearCanvas(); /* eslint-disable-next-line */ }, [mode]);

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const down = (e: React.PointerEvent) => {
    e.preventDefault(); drawing.current = true;
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#111';
    const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext('2d')!;
    const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const up = () => {
    if (!drawing.current) return; drawing.current = false;
    setPreview(canvasRef.current!.toDataURL('image/png'));
  };

  // 파일 업로드 → 캔버스에 그려 PNG로 변환(투명/흰배경 그대로)
  const onFile = (f?: File | null) => {
    if (!f) return;
    const img = new Image();
    img.onload = () => {
      const max = 600;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      cv.getContext('2d')!.drawImage(img, 0, 0, w, h);
      setPreview(cv.toDataURL('image/png'));
    };
    img.src = URL.createObjectURL(f);
  };

  const save = async () => {
    if (!name.trim()) { setMsg('점검자 이름을 입력해주세요'); return; }
    if (!preview) { setMsg('서명을 그리거나 이미지를 올려주세요'); return; }
    setSaving(true); setMsg('');
    try {
      const r = await fetch('/api/signature', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inspector_name: name.trim(), data_url: preview }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || '저장 실패');
      setCurrent(preview); setPreview(null); clearCanvas();
      setMsg('✅ 저장되었습니다. 이제 이 점검자로 생성하는 점검표에 서명이 들어갑니다.');
    } catch (e: any) { setMsg('❌ ' + e.message); } finally { setSaving(false); }
  };

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, marginBottom: 16 };
  const input: React.CSSProperties = { width: '100%', padding: '12px 14px', background: 'var(--bg-input, var(--bg))', border: '1.5px solid var(--border)', borderRadius: 10, fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div style={{ padding: '32px 36px 60px', maxWidth: 720 }}>
      <h1 style={{ fontSize: 24, fontWeight: 900, marginBottom: 6 }}>✍️ 점검자 서명 등록</h1>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
        점검자별로 서명을 한 번 등록해두면, 그 점검자로 생성하는 점검표(별지1·별지14 서명칸)에 자동으로 들어갑니다.
      </p>

      <div style={card}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>점검자 이름</label>
        <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="예: 황건우" />
        {current && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>현재 등록된 서명:</span>
            <img src={current} alt="등록된 서명" style={{ height: 48, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }} />
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['draw', 'upload'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setPreview(null); }} style={{
              padding: '8px 18px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
              border: `1.5px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
              background: mode === m ? 'var(--accent-soft)' : 'transparent',
              color: mode === m ? 'var(--accent)' : 'var(--text-secondary)',
            }}>{m === 'draw' ? '✏️ 직접 그리기' : '🖼️ 이미지 업로드'}</button>
          ))}
        </div>

        {mode === 'draw' ? (
          <div>
            <canvas ref={canvasRef} width={600} height={200}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
              style={{ width: '100%', height: 200, background: '#fff', border: '1.5px dashed var(--border)', borderRadius: 10, touchAction: 'none', cursor: 'crosshair' }} />
            <button onClick={clearCanvas} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>지우기</button>
          </div>
        ) : (
          <div>
            <input type="file" accept="image/png,image/jpeg" onChange={e => onFile(e.target.files?.[0])} />
            {preview && <div style={{ marginTop: 14 }}><img src={preview} alt="미리보기" style={{ height: 80, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: 4 }} /></div>}
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>흰 배경 서명 이미지(PNG/JPG)를 올리세요. 투명 PNG면 더 깔끔합니다.</p>
          </div>
        )}
      </div>

      {msg && <div style={{ ...card, padding: '14px 18px', fontSize: 14 }}>{msg}</div>}

      <button onClick={save} disabled={saving} style={{
        width: '100%', padding: 16, borderRadius: 12, border: 'none',
        background: saving ? 'var(--border)' : 'linear-gradient(135deg, #0066ff, #00b8d9)',
        color: '#fff', fontSize: 15, fontWeight: 700, cursor: saving ? 'default' : 'pointer', fontFamily: 'inherit',
      }}>{saving ? '저장 중...' : '💾 서명 저장'}</button>
    </div>
  );
}
