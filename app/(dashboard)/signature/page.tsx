'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Status } from '@/components/ui/Status';
import { PenLine, ImageUp, Loader2 } from 'lucide-react';

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
      setMsg('✅ 저장했습니다. 이 점검자로 만드는 점검표에 서명이 들어갑니다.');
    } catch (e: any) { setMsg('❌ ' + e.message); } finally { setSaving(false); }
  };

  const card: React.CSSProperties = { background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: 20, marginBottom: 12 };
  const input: React.CSSProperties = { width: '100%', padding: '12px 14px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 14, color: 'var(--text-primary)', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div className="page-pad" style={{ padding: '28px 32px 60px', maxWidth: 720 }}>
      <h1 style={{ margin: '0 0 4px' }}>서명</h1>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)' }}>
        점검자마다 서명을 한 번 등록하면 그 점검자로 만드는 점검표의 서명칸(별지1, 별지14)에 들어갑니다.
      </p>

      <div style={card}>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>점검자 이름</label>
        <input style={input} value={name} onChange={e => setName(e.target.value)} placeholder="예: 황건우" />
        {current && (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>등록된 서명</span>
            <img src={current} alt="등록된 서명" style={{ height: 48, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: 2 }} />
          </div>
        )}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {(['draw', 'upload'] as const).map(m => (
            <button key={m} onClick={() => { setMode(m); setPreview(null); }} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
              border: `1px solid ${mode === m ? 'var(--accent)' : 'var(--border)'}`,
              background: mode === m ? 'var(--accent-soft)' : 'var(--bg-card)',
              color: mode === m ? 'var(--accent)' : 'var(--text-secondary)',
            }}>{m === 'draw' ? <><PenLine size={15} /> 직접 그리기</> : <><ImageUp size={15} /> 이미지 올리기</>}</button>
          ))}
        </div>

        {mode === 'draw' ? (
          <div>
            <canvas ref={canvasRef} width={600} height={200}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
              style={{ width: '100%', height: 200, background: '#fff', border: '1px solid var(--border-hover)', borderRadius: 8, touchAction: 'none', cursor: 'crosshair' }} />
            <button onClick={clearCanvas} style={{ marginTop: 10, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>지우기</button>
          </div>
        ) : (
          <div>
            <input type="file" accept="image/png,image/jpeg" onChange={e => onFile(e.target.files?.[0])} />
            {preview && <div style={{ marginTop: 14 }}><img src={preview} alt="미리보기" style={{ height: 80, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: 4 }} /></div>}
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 10 }}>흰 배경 서명 이미지(PNG, JPG)를 올리세요. 배경이 투명한 PNG가 가장 깔끔합니다.</p>
          </div>
        )}
      </div>

      {msg && <Status msg={msg} style={{ marginBottom: 12 }} />}

      <button onClick={save} disabled={saving} className="btn-primary" style={{ width: '100%' }}>{saving ? <><Loader2 size={17} className="spin" /> 저장하는 중</> : '서명 저장'}</button>
    </div>
  );
}
