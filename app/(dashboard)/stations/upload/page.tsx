'use client';
// ============================================================
// app/(dashboard)/stations/upload/page.tsx
// 관리구역 등록 업로드 페이지
// ============================================================
import { useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export default function StationUploadPage() {
  const { profile } = useAuth();
  const supabase = createClient();

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile]               = useState<File | null>(null);
  const [sectorName, setSectorName]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<{inserted:number; sectorName:string} | null>(null);
  const [error, setError]             = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setError(''); setResult(null); }
  };

  const handleUpload = async () => {
    if (!file) { setError('엑셀 파일을 선택해주세요'); return; }
    setLoading(true);
    setError('');
    try {
      const { data:{ session } } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append('file', file);
      fd.append('sector_name', sectorName || profile?.sector?.name || '기본구역');

      const res = await fetch('/api/stations/upload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── 양식 다운로드: CSV로 생성 (엑셀에서 바로 열기 가능) ────────────
  const downloadTemplate = () => {
    const rows = [
      // 1행: 안내문
      ['담당자명', '현장명', '관리구역명', '수전전압', '계약용량', '수배전반 개수', '측정개소명(쉼표구분)', '기본점검양식(월차/분기/반기/연차)', '비고'],
      // 2행: 예시 데이터
      ['홍길동', '횡성휴게소(강릉방향)', '강원권', '22900', '1849', '2', '수배전반 #1,수배전반 #2', '월차', ''],
    ];

    const BOM = '\uFEFF'; // UTF-8 BOM (엑셀 한글 깨짐 방지)
    const csv = BOM + rows.map(row =>
      row.map(cell => {
        const str = String(cell ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
      }).join(',')
    ).join('\r\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '관리구역_등록양식.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    background: 'var(--bg)', border: '1.5px solid var(--border)',
    borderRadius: 10, fontSize: 14, color: 'var(--text)',
    outline: 'none', fontFamily: 'inherit', letterSpacing: '-0.02em',
    boxSizing: 'border-box',
  };

  return (
    <div style={{ padding: '40px 48px 80px', maxWidth: 700 }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 32 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-1px', marginBottom: 8 }}>
          📂 관리구역 등록
        </h1>
        <p style={{ fontSize: 13, color: 'var(--mid)', lineHeight: 1.7 }}>
          담당 현장 정보를 엑셀로 일괄 등록합니다. 업로드 후 점검 생성에서 해당 현장이 표시됩니다.
        </p>
      </div>

      {/* 양식 다운로드 */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '20px 24px', marginBottom: 16,
        boxShadow: 'var(--shadow)',
        display: 'flex', alignItems: 'center', gap: 16,
      }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12, flexShrink: 0,
          background: 'rgba(16,185,129,.1)', display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 24,
        }}>📋</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>등록 양식 다운로드</div>
          <div style={{ fontSize: 12, color: 'var(--dim)' }}>
            양식에 현장 정보를 입력 후 업로드하세요
          </div>
        </div>
        <button onClick={downloadTemplate} style={{
          padding: '10px 18px', borderRadius: 10, border: 'none',
          background: 'linear-gradient(135deg, #10b981, #059669)',
          color: '#fff', fontSize: 13, fontWeight: 700,
          cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
        }}>⬇ 양식 다운로드</button>
      </div>

      {/* 컬럼 안내 */}
      <div style={{
        background: 'rgba(0,102,255,.04)', border: '1px solid rgba(0,102,255,.15)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 20, fontSize: 12,
      }}>
        <div style={{ fontWeight: 700, marginBottom: 10, color: 'var(--blue)' }}>📌 엑셀 컬럼 안내 (3행부터 데이터 입력)</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 20px', color: 'var(--mid)' }}>
          {[
            ['A', '담당자명 (점검자 기본값)'],
            ['B', '현장명 (예: 횡성휴게소 강릉방향)'],
            ['C', '관리구역명'],
            ['D', '수전전압 (예: 22900)'],
            ['E', '계약용량 (예: 950)'],
            ['F', '수배전반 개수'],
            ['G', '측정개소명 (쉼표 구분)'],
            ['H', '기본 점검표 양식 (월차/분기/반기/연차)'],
            ['I', '비고'],
          ].map(([col, desc]) => (
            <div key={col} style={{ display: 'flex', gap: 8 }}>
              <span style={{
                width: 20, height: 20, background: 'rgba(0,102,255,.1)', color: 'var(--blue)',
                borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 800, fontFamily: 'monospace', flexShrink: 0,
              }}>{col}</span>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 업로드 폼 */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '24px', boxShadow: 'var(--shadow)',
        marginBottom: 16,
      }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            관리구역명 (미입력 시 기본구역)
          </label>
          <input
            style={inputStyle}
            placeholder="예: 강원권, 수도권, 충청권"
            value={sectorName}
            onChange={e => setSectorName(e.target.value)}
          />
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            엑셀 파일 선택 *
          </label>
          <label style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '32px 20px', borderRadius: 12,
            border: `2px dashed ${file ? 'var(--blue)' : 'var(--border)'}`,
            background: file ? 'rgba(0,102,255,.04)' : 'transparent',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>{file ? '✅' : '📂'}</div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: 'var(--text)' }}>
              {file ? file.name : '클릭하여 엑셀 파일 선택'}
            </div>
            <div style={{ fontSize: 12, color: 'var(--dim)' }}>
              {file ? `${(file.size/1024).toFixed(1)}KB` : '.xlsx, .xls 파일 지원'}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              style={{ display: 'none' }}
              onChange={handleFileChange}
            />
          </label>
        </div>

        <button
          onClick={handleUpload}
          disabled={loading || !file}
          style={{
            width: '100%', padding: '14px', borderRadius: 12, border: 'none',
            background: loading || !file
              ? 'var(--border)'
              : 'linear-gradient(135deg, #0066ff, #0052cc)',
            color: loading || !file ? 'var(--dim)' : '#fff',
            fontSize: 15, fontWeight: 700, cursor: loading || !file ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit', transition: 'all 0.15s',
          }}
        >
          {loading ? '⏳ 등록 중...' : '⚡ 관리구역 일괄 등록'}
        </button>
      </div>

      {/* 에러 */}
      {error && (
        <div style={{
          background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.25)',
          borderRadius: 10, padding: '12px 16px', fontSize: 13, color: '#ef4444',
        }}>
          ❌ {error}
        </div>
      )}

      {/* 성공 */}
      {result && (
        <div style={{
          background: 'rgba(16,185,129,.08)', border: '1px solid rgba(16,185,129,.25)',
          borderRadius: 10, padding: '16px 20px', fontSize: 13,
        }}>
          <div style={{ fontWeight: 700, color: '#10b981', marginBottom: 4 }}>✅ 등록 완료!</div>
          <div style={{ color: 'var(--mid)' }}>
            <strong>{result.sectorName}</strong> 구역에 <strong>{result.inserted}개</strong> 현장이 등록되었습니다.
          </div>
        </div>
      )}
    </div>
  );
}
