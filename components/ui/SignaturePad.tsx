'use client';
// ============================================================
// components/ui/SignaturePad.tsx — 서명 입력 (직접 그리기 / 이미지 올리기)
//  · onChange(dataUrl | null): PNG data URL (그린 게 없으면 null)
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { PenLine, ImageUp, Eraser } from 'lucide-react';

export function SignaturePad({ onChange, height = 160 }: { onChange: (dataUrl: string | null) => void; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const [mode, setMode] = useState<'draw' | 'upload'>('draw');
  const [preview, setPreview] = useState<string | null>(null);

  const ctx = () => {
    const c = canvasRef.current!; const g = c.getContext('2d')!;
    g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#111';
    return g;
  };
  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!; const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = true; e.currentTarget.setPointerCapture(e.pointerId);
    const p = pos(e); const g = ctx(); g.beginPath(); g.moveTo(p.x, p.y);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const p = pos(e); const g = ctx(); g.lineTo(p.x, p.y); g.stroke(); dirty.current = true;
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (dirty.current) onChange(canvasRef.current!.toDataURL('image/png'));
  };
  const clear = () => {
    const c = canvasRef.current; if (c) c.getContext('2d')!.clearRect(0, 0, c.width, c.height);
    dirty.current = false; setPreview(null); onChange(null);
  };
  useEffect(() => { clear(); /* 모드 바꾸면 비움 */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // 이미지 올리기 → 캔버스에 맞춰 그려 PNG로 변환(투명 배경 유지)
  const onFile = (f?: File) => {
    if (!f) return;
    const img = new Image(); const url = URL.createObjectURL(f);
    img.onload = () => {
      const k = Math.min(1, 800 / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const d = c.toDataURL('image/png'); URL.revokeObjectURL(url);
      setPreview(d); onChange(d);
    };
    img.src = url;
  };

  const tab = (on: boolean): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer',
    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'var(--accent-soft)' : 'var(--bg-card)', color: on ? 'var(--accent)' : 'var(--text-secondary)',
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        <button type="button" onClick={() => setMode('draw')} style={tab(mode === 'draw')}><PenLine size={14} /> 직접 그리기</button>
        <button type="button" onClick={() => setMode('upload')} style={tab(mode === 'upload')}><ImageUp size={14} /> 이미지 올리기</button>
        <span style={{ flex: 1 }} />
        <button type="button" onClick={clear} style={{ ...tab(false), padding: '6px 9px' }}><Eraser size={14} /> 지우기</button>
      </div>
      {mode === 'draw' ? (
        <canvas ref={canvasRef} width={600} height={Math.round(height * 1.5)}
          onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          style={{ width: '100%', height, background: '#fff', border: '1px solid var(--border-hover)', borderRadius: 8, touchAction: 'none', cursor: 'crosshair', display: 'block' }} />
      ) : (
        <div>
          <input type="file" accept="image/png,image/jpeg" onChange={(e) => onFile(e.target.files?.[0])} style={{ fontSize: 13 }} />
          {preview && <img src={preview} alt="서명 미리보기" style={{ display: 'block', marginTop: 8, height: 70, background: '#fff', border: '1px solid var(--border)', borderRadius: 6, padding: 4 }} />}
          <canvas ref={canvasRef} width={1} height={1} style={{ display: 'none' }} />
        </div>
      )}
    </div>
  );
}
