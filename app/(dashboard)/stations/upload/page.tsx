'use client';
// ============================================================
// app/(dashboard)/stations/upload/page.tsx
// 관리구역 등록 업로드 페이지
// ============================================================
import { useState, useRef, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Download, FileSpreadsheet, Upload, Plus, Pencil, Trash2, Save, Loader2, CheckCircle2, XCircle, DraftingCompass } from 'lucide-react';
import Link from 'next/link';

export default function StationUploadPage() {
  const { profile } = useAuth();
  const supabase = createClient();

  // localStorage 에서 토큰 직접 읽기 (Web Lock 미사용 → 인증 교착 회피)
  const getTokenNoLock = (): string | null => {
    try {
      const key = Object.keys(localStorage).find(k => k.includes('auth-token'));
      if (!key) return null;
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const v = JSON.parse(raw);
      return v?.access_token || null;
    } catch { return null; }
  };

  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile]               = useState<File | null>(null);
  const [sectorName, setSectorName]   = useState('');
  const [loading, setLoading]         = useState(false);
  const [result, setResult]           = useState<{inserted:number; updated?:number; total?:number; sectorName:string} | null>(null);
  const [error, setError]             = useState('');

  // 직접 추가 폼 + 목록
  const [stations, setStations] = useState<any[]>([]);
  // 점검 양식(연차 양식 = 분기·반기·연차 공용 기준 양식)이 있는 충전소
  const [formIds, setFormIds] = useState<Set<string>>(new Set());
  const [partialIds, setPartialIds] = useState<Set<string>>(new Set());   // 연차 없이 분기/반기 양식만 있는 충전소
  const [justAdded, setJustAdded] = useState<{ id: string; name: string } | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState('');
  const emptyForm = { name: '', sectorLabel: '', voltage: '', capacity: '', panelCount: '1', defaultType: '월차', inspectorName: '' };
  const [form, setForm] = useState({ ...emptyForm });
  const [stationQuery, setStationQuery] = useState('');

  // 등록된 관리구역 수정
  const [editing, setEditing] = useState<any>(null);
  const [editForm, setEditForm] = useState<any>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editErr, setEditErr] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    acceptFile(e.target.files?.[0]);
  };

  const acceptFile = (f?: File | null) => {
    if (!f) return;
    if (!/\.(xlsx|xls)$/i.test(f.name)) {
      setError('.xlsx 또는 .xls 파일만 업로드할 수 있습니다.');
      return;
    }
    setFile(f); setError(''); setResult(null);
  };

  const [dragActive, setDragActive] = useState(false);
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragActive(true); };
  const onDragLeave = (e: React.DragEvent) => { e.preventDefault(); setDragActive(false); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragActive(false);
    acceptFile(e.dataTransfer.files?.[0]);
  };

  // 등록된 내 관리구역 목록 불러오기 (쿠키 인증 서버 API 사용)
  const loadStations = async (_sectorId?: string) => {
    setListLoading(true);
    try {
      const res = await fetch('/api/stations/list', { method: 'GET' });
      const data = await res.json();
      if (res.ok && data.success) setStations(data.stations || []);
      else setStations([]);
    } catch (e) { setStations([]); } finally { setListLoading(false); }
    try {
      const t = await (await fetch('/api/templates/list')).json();
      if (t.success) {
        setFormIds(new Set(t.rows.filter((r: any) => r.templates.some((x: any) => x.inspection_group === '연차')).map((r: any) => r.station_id)));
        setPartialIds(new Set(t.rows.filter((r: any) => r.templates.length && !r.templates.some((x: any) => x.inspection_group === '연차')).map((r: any) => r.station_id)));
      }
    } catch { /* 양식 표시는 없어도 됨 */ }
  };

  useEffect(() => {
    loadStations();
  }, []);

  // 충전소 하나 직접 추가
  const handleAddOne = async () => {
    setAddErr('');
    if (!form.name.trim()) { setAddErr('현장명을 입력해주세요'); return; }
    setAdding(true);
    try {
      const secName = (sectorName || form.sectorLabel || '').trim();
      const res = await fetch('/api/stations/add-one', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name.trim(),
          sector_name: secName,
          inspector_name: form.inspectorName.trim(),
          voltage: form.voltage,
          capacity: form.capacity,
          panel_count: form.panelCount,
          default_type: form.defaultType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '추가 실패');
      setForm({ ...emptyForm });
      if (data.station?.id) setJustAdded({ id: data.station.id, name: data.station.name });
      await loadStations();
    } catch (e: any) { setAddErr(e.message); } finally { setAdding(false); }
  };

  const startEdit = (st: any) => {
    setEditErr('');
    setEditing(st);
    const pn = st.custom_values?.panel_names;
    setEditForm({
      name: st.name || '',
      sector_label: st.custom_values?.sector_label || '',
      voltage: st.voltage ?? '',
      capacity: st.capacity ?? '',
      panel_count: st.panel_count ?? 1,
      panel_names: Array.isArray(pn) ? pn.join(', ') : (pn || ''),
      notes: st.custom_values?.notes || '',
    });
  };
  const cancelEdit = () => { setEditing(null); setEditForm(null); setEditErr(''); };
  const saveEdit = async () => {
    if (!editForm?.name?.trim()) { setEditErr('현장명을 입력해주세요'); return; }
    setSavingEdit(true); setEditErr('');
    try {
      const res = await fetch('/api/stations/update', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editing.id, ...editForm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '수정 실패');
      setStations(prev => prev.map(s => (s.id === editing.id ? data.station : s)));
      cancelEdit();
    } catch (e: any) { setEditErr(e.message); } finally { setSavingEdit(false); }
  };

  const handleDeleteStation = async (st: any) => {
    if (!confirm(`정말 삭제하시겠습니까?\n\n${st.name}\n\n이 관리구역이 목록에서 삭제됩니다.`)) return;
    try {
      const res = await fetch('/api/stations/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: st.id }),
      });
      const data = await res.json();
      if (!res.ok) { alert('삭제 실패: ' + (data.error || '')); return; }
      setStations(prev => prev.filter(s => s.id !== st.id));
    } catch (e: any) { alert('삭제 실패: ' + e.message); }
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
      await loadStations();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // ─── 양식 다운로드: 서버에서 .xlsx 생성 (업로드 형식과 동일) ────────────
  const downloadTemplate = () => {
    const a = document.createElement('a');
    a.href = '/api/stations/template';
    a.download = '관리구역_등록양식.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px',
    background: 'var(--bg-input)', border: '1px solid var(--border)',
    borderRadius: 8, fontSize: 14, color: 'var(--text)',
    outline: 'none', fontFamily: 'inherit',
    boxSizing: 'border-box',
  };

  return (
    <div className="page-pad" style={{ padding: '28px 32px 60px', maxWidth: 720 }}>
      {/* 헤더 */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ margin: '0 0 4px' }}>관리구역</h1>
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
          담당 충전소를 엑셀로 한꺼번에 또는 하나씩 등록합니다. 등록한 충전소는 점검 생성 목록에 나타납니다.
        </p>
      </div>

      {/* 양식 다운로드 */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '16px 18px', marginBottom: 12,
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 38, height: 38, borderRadius: 8, flexShrink: 0,
          background: 'var(--positive-soft)', color: 'var(--positive)', display: 'flex',
          alignItems: 'center', justifyContent: 'center',
        }}><FileSpreadsheet size={19} /></div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>등록 양식</div>
          <div style={{ fontSize: 13, color: 'var(--dim)' }}>
            양식에 충전소 정보를 적은 뒤 아래에서 올리세요.
          </div>
        </div>
        <button onClick={downloadTemplate} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-hover)',
          background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600,
          cursor: 'pointer', flexShrink: 0,
        }}><Download size={15} /> 양식 내려받기</button>
      </div>

      {/* 컬럼 안내 */}
      <div style={{
        background: 'var(--bg-elevated)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '14px 18px', marginBottom: 12, fontSize: 13,
      }}>
        <div style={{ fontWeight: 600, marginBottom: 10, color: 'var(--text-primary)' }}>엑셀 열 구성 <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(3행부터 입력)</span></div>
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
                width: 20, height: 20, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)',
                borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 600, flexShrink: 0,
              }}>{col}</span>
              <span>{desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 업로드 폼 */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 10, padding: '20px',
        marginBottom: 12,
      }}>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            관리구역 이름 (비우면 기본구역)
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
            엑셀 파일
          </label>
          <label
            onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '28px 20px', borderRadius: 8,
            border: `1.5px dashed ${dragActive || file ? 'var(--accent)' : 'var(--border-hover)'}`,
            background: dragActive ? 'var(--accent-soft)' : 'var(--bg-elevated)',
            cursor: 'pointer',
          }}>
            <div style={{ marginBottom: 8, color: file ? 'var(--positive)' : 'var(--text-tertiary)' }}>{file ? <CheckCircle2 size={28} /> : <Upload size={28} />}</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2, color: 'var(--text)' }}>
              {file ? file.name : (dragActive ? '여기에 놓으세요' : '눌러서 고르거나 파일을 끌어다 놓으세요')}
            </div>
            <div style={{ fontSize: 12, color: 'var(--dim)' }}>
              {file ? `${(file.size/1024).toFixed(1)}KB` : '.xlsx, .xls'}
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
            width: '100%', padding: '12px', borderRadius: 8, border: 'none',
            background: loading || !file ? 'var(--bg-elevated)' : 'var(--accent)',
            color: loading || !file ? 'var(--dim)' : '#fff',
            fontSize: 15, fontWeight: 600, cursor: loading || !file ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}
        >
          {loading ? <><Loader2 size={17} className="spin" /> 등록하는 중</> : '엑셀로 한꺼번에 등록'}
        </button>
      </div>

      {/* 에러 */}
      {error && (
        <div style={{
          background: 'var(--negative-soft)', border: '1px solid rgba(201,54,54,.25)',
          borderRadius: 8, padding: '12px 16px', fontSize: 13, color: 'var(--negative)', display: 'flex', gap: 8, alignItems: 'flex-start',
        }}>
          <XCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} /> {error}
        </div>
      )}

      {/* 성공 */}
      {result && (
        <div style={{
          background: 'var(--positive-soft)', border: '1px solid rgba(31,138,91,.25)',
          borderRadius: 8, padding: '14px 18px', fontSize: 13,
        }}>
          <div className="ico" style={{ fontWeight: 600, color: 'var(--positive)', marginBottom: 4 }}><CheckCircle2 size={16} /> 등록했습니다</div>
          <div style={{ color: 'var(--mid)' }}>
            <strong>{result.sectorName}</strong> 구역에 새로 <strong>{result.inserted}개</strong>
            {result.updated ? <>, 수정 <strong>{result.updated}개</strong></> : null}를 반영했습니다.
          </div>
        </div>
      )}

      {/* 직접 하나씩 추가 */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px', marginTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 2 }}>하나씩 추가</div>
        <div style={{ fontSize: 13, color: 'var(--dim)', marginBottom: 16 }}>엑셀 없이 충전소를 하나씩 등록합니다.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }} className="add-grid">
          <div style={{ gridColumn: '1 / -1' }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>현장명 (필수)</label>
            <input style={inputStyle} placeholder="예: 횡성휴게소(강릉방향)" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>관리구역명</label>
            <input style={inputStyle} placeholder="예: 강원권 (미입력 시 위 구역)" value={form.sectorLabel} onChange={e => setForm({ ...form, sectorLabel: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>담당자명</label>
            <input style={inputStyle} placeholder="점검자 이름" value={form.inspectorName} onChange={e => setForm({ ...form, inspectorName: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>수전전압 (V)</label>
            <input style={inputStyle} type="number" placeholder="예: 22900" value={form.voltage} onChange={e => setForm({ ...form, voltage: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>계약용량 (kW)</label>
            <input style={inputStyle} type="number" placeholder="예: 950" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>수배전반 개수</label>
            <input style={inputStyle} type="number" min={1} value={form.panelCount} onChange={e => setForm({ ...form, panelCount: e.target.value })} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>기본 점검양식</label>
            <select style={inputStyle} value={form.defaultType} onChange={e => setForm({ ...form, defaultType: e.target.value })}>
              <option value="월차">월차</option>
              <option value="분기">분기</option>
              <option value="반기">반기</option>
              <option value="연차">연차</option>
            </select>
          </div>
        </div>
        {addErr && (<div className="status err" style={{ marginTop: 12, fontSize: 13 }}><XCircle size={15} /> {addErr}</div>)}
        {justAdded && (
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 8, background: 'var(--positive-soft)', border: '1px solid rgba(31,138,91,.25)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <CheckCircle2 size={16} color="var(--positive)" style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 200 }}><b>{justAdded.name}</b>을(를) 추가했습니다. 이어서 설계도면으로 점검 양식을 만드세요. 양식 하나로 분기, 반기, 연차 점검표를 모두 만듭니다.</span>
            <Link href={`/annual-builder?station=${justAdded.id}`} className="btn-primary" style={{ textDecoration: 'none', padding: '7px 12px', fontSize: 13 }}><DraftingCompass size={15} /> 점검 양식 만들기</Link>
          </div>
        )}
        <button onClick={handleAddOne} disabled={adding} style={{ width: '100%', marginTop: 18, padding: '14px', borderRadius: 8, border: '1px solid var(--border-hover)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 15, fontWeight: 600, cursor: adding ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>{adding ? <><Loader2 size={16} className="spin" /> 추가하는 중</> : <><Plus size={16} /> 추가</>}</button>
      </div>

      {/* 등록된 관리구역 (검색 방식) */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 700 }}>등록된 충전소</span>
          <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{stations.length}개소</span>
        </div>
        <input
          style={inputStyle}
          placeholder="현장명으로 검색 (예: 강릉휴게소)"
          value={stationQuery}
          onChange={e => setStationQuery(e.target.value)}
        />
        {listLoading ? (
          <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--dim)' }}>불러오는 중</div>
        ) : stationQuery.trim() === '' ? (
          <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--dim)' }}>검색하면 충전소가 표시됩니다.</div>
        ) : (() => {
          const q = stationQuery.trim().toLowerCase();
          const filtered = stations.filter(st => (st.name || '').toLowerCase().includes(q));
          if (filtered.length === 0) {
            return <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 13, color: 'var(--dim)' }}>'{stationQuery}'에 맞는 충전소가 없습니다.</div>;
          }
          return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 14 }}>
              {filtered.map(st => (
                <div key={st.id}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 8, background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {st.name}
                        <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5, verticalAlign: 'middle', background: formIds.has(st.id) ? 'var(--positive-soft)' : 'var(--warning-soft)', color: formIds.has(st.id) ? 'var(--positive)' : 'var(--warning)' }}>{formIds.has(st.id) ? '점검 양식 있음' : partialIds.has(st.id) ? '분기 양식만' : '점검 양식 없음'}</span>
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--dim)', marginTop: 1 }}>{[`${st.voltage}V`, `${st.capacity}kW`, `수배전반 ${st.panel_count}개`, st.custom_values?.default_type].filter(Boolean).join(', ')}</div>
                    </div>
                    <Link href={`/annual-builder?station=${st.id}`} title={formIds.has(st.id) ? '도면으로 점검 양식 다시 만들기' : '도면으로 점검 양식 만들기'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, background: formIds.has(st.id) ? 'var(--bg-card)' : 'var(--accent)', color: formIds.has(st.id) ? 'var(--text-primary)' : '#fff', border: formIds.has(st.id) ? '1px solid var(--border-hover)' : '1px solid var(--accent)', fontSize: 12, fontWeight: 600, flexShrink: 0, textDecoration: 'none' }}><DraftingCompass size={13} /> {formIds.has(st.id) ? '양식' : '양식 만들기'}</Link>
                    <button onClick={() => (editing?.id === st.id ? cancelEdit() : startEdit(st))} title="수정" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, background: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--border-hover)', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}><Pencil size={13} /> 수정</button>
                    <button onClick={() => handleDeleteStation(st)} title="삭제" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 10px', borderRadius: 7, background: 'var(--bg-card)', color: 'var(--negative)', border: '1px solid rgba(201,54,54,.3)', cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}><Trash2 size={13} /> 삭제</button>
                  </div>

                  {editing?.id === st.id && editForm && (
                    <div style={{ marginTop: 8, padding: '16px 16px 18px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--accent-soft)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--accent)' }}>충전소 수정</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }} className="add-grid">
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>현장명 (필수)</label>
                          <input style={inputStyle} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>관리구역명</label>
                          <input style={inputStyle} value={editForm.sector_label} onChange={e => setEditForm({ ...editForm, sector_label: e.target.value })} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>수전전압 (V)</label>
                          <input style={inputStyle} type="number" value={editForm.voltage} onChange={e => setEditForm({ ...editForm, voltage: e.target.value })} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>계약용량 (kW)</label>
                          <input style={inputStyle} type="number" value={editForm.capacity} onChange={e => setEditForm({ ...editForm, capacity: e.target.value })} />
                        </div>
                        <div>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>점검개소 수 (수배전반)</label>
                          <input style={inputStyle} type="number" min={1} value={editForm.panel_count} onChange={e => setEditForm({ ...editForm, panel_count: e.target.value })} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>점검개소명 (쉼표로 구분)</label>
                          <input style={inputStyle} placeholder="예: 수배전반-1, 수배전반-2" value={editForm.panel_names} onChange={e => setEditForm({ ...editForm, panel_names: e.target.value })} />
                        </div>
                        <div style={{ gridColumn: '1 / -1' }}>
                          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 6 }}>비고</label>
                          <input style={inputStyle} value={editForm.notes} onChange={e => setEditForm({ ...editForm, notes: e.target.value })} />
                        </div>
                      </div>
                      {editErr && (<div className="status err" style={{ marginTop: 10, fontSize: 12 }}><XCircle size={14} /> {editErr}</div>)}
                      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                        <button onClick={saveEdit} disabled={savingEdit} style={{ flex: 1, padding: '11px', borderRadius: 8, border: 'none', background: savingEdit ? 'var(--bg-elevated)' : 'var(--accent)', color: savingEdit ? 'var(--dim)' : '#fff', fontSize: 14, fontWeight: 600, cursor: savingEdit ? 'not-allowed' : 'pointer' }}>{savingEdit ? '저장하는 중' : '저장'}</button>
                        <button onClick={cancelEdit} disabled={savingEdit} style={{ padding: '11px 18px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--mid)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>취소</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      <style jsx>{`@media (max-width: 768px) { .add-grid { grid-template-columns: 1fr !important; } }`}</style>
    </div>
  );
}
