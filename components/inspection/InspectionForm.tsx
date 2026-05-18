'use client';
// ============================================================
// components/inspection/InspectionForm.tsx — 점검 생성 폼
// 엑셀 생성 + File System Access API 로컬 폴더 자동 저장
// ============================================================
import { useState } from 'react';
import { useFileSystem } from '@/hooks/useFileSystem';
import { useStations } from '@/hooks/useStations';
import { Station, InspectionType } from '@/types';
import { groupStations } from '@/lib/utils/station-group';
import { getInspectionTypeByMonth } from '@/lib/utils/inspection-type';

const TYPE_OPTIONS: { value: InspectionType; label: string; months: string }[] = [
  { value: '월차', label: '월차', months: '1,2,4,5,7,8,12월' },
  { value: '분기', label: '분기', months: '3, 9월' },
  { value: '반기', label: '반기', months: '3, 9월' },
  { value: '연차', label: '연차', months: '11월' },
];

function MeasureRow({ label, unit, keys, values, onChange }: {
  label: string; unit: string; keys: string[];
  values: Record<string, number | undefined>;
  onChange: (k: string, v: number | undefined) => void;
}) {
  const phases = ['A상', 'B상', 'C상', 'N'];
  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5">{label}</label>
      <div className="grid grid-cols-4 gap-2">
        {phases.map((phase, i) => (
          <div key={phase} className="relative">
            <input type="number" className="toss-input pr-7 text-sm" placeholder={phase}
              value={values[keys[i]] ?? ''}
              onChange={e => onChange(keys[i], e.target.value === '' ? undefined : Number(e.target.value))} />
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs pointer-events-none"
              style={{ color: 'var(--text-secondary)' }}>{unit}</span>
          </div>
        ))}
      </div>
      <div className="flex text-[10px] mt-0.5 gap-2" style={{ color: 'var(--text-tertiary)' }}>
        {phases.map(p => <span key={p} className="flex-1 text-center">{p}</span>)}
      </div>
    </div>
  );
}

export function InspectionForm() {
  const { stations } = useStations();
  const { isSupported, rootFolderName, status: fsStatus, lastSavedPath, error: fsError, selectRootFolder, saveExcel } = useFileSystem();

  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().getMonth() + 1;
  const autoType = (() => { try { return getInspectionTypeByMonth(currentMonth); } catch { return '월차' as InspectionType; } })();

  const [selectedStation, setSelectedStation] = useState<Station | null>(null);
  const [stationQuery, setStationQuery] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [inspectionType, setInspectionType] = useState<InspectionType>(autoType);
  const [date, setDate] = useState(today);
  const [inspectorName, setInspectorName] = useState('');
  const [count, setCount] = useState(1);
  const [measures, setMeasures] = useState<Record<string, number | undefined>>({});
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const groups = groupStations(stations);
  const filtered = groups.filter(g => !stationQuery || g.base_name.includes(stationQuery));
  const updateMeasure = (key: string, val: number | undefined) => setMeasures(prev => ({ ...prev, [key]: val }));

  const handleCreate = async () => {
    if (!selectedStation) return alert('충전소를 선택해주세요');
    if (!inspectorName.trim()) return alert('점검자 이름을 입력해주세요');
    if (isSupported && !rootFolderName) return alert('저장 폴더를 먼저 선택해주세요');
    setLoading(true);
    try {
      const res = await fetch('/api/inspection/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station_id: selectedStation.id, inspection_type: inspectionType, date, inspector_name: inspectorName, count, ...measures, remarks: remarks || '특이사항없음' }),
      });
      if (!res.ok) throw new Error((await res.json()).error || '생성 실패');
      const { fileName, fileBase64, folderStructure } = await res.json();
      await saveExcel(fileBase64, fileName, folderStructure);
      setDone(true);
    } catch (e: any) {
      alert(`오류: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-xl">
        <div className="rounded-[20px] p-8 text-center"
          style={{ background: 'linear-gradient(135deg,rgba(5,192,114,.08),rgba(49,130,246,.08))', border: '1px solid rgba(5,192,114,.3)' }}>
          <div className="text-4xl mb-4">✅</div>
          <h2 className="text-lg font-[800] mb-2">저장 완료!</h2>
          {lastSavedPath && (
            <div className="px-4 py-3 rounded-[10px] mb-4 text-left"
              style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <div className="text-[10px] font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>저장 경로</div>
              <div className="text-xs font-mono break-all">📁 {lastSavedPath}</div>
            </div>
          )}
          {fsError && <div className="text-xs mb-4 px-3 py-2 rounded-[8px]" style={{ background: 'rgba(245,166,35,.1)', color: '#F5A623' }}>⚠️ {fsError}</div>}
          <button className="toss-btn-primary" onClick={() => { setDone(false); setMeasures({}); setRemarks(''); }}>새 점검 생성</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-4">
      {/* 저장 폴더 */}
      <div className="p-4 rounded-[14px]" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-bold mb-0.5">📁 저장 폴더</div>
            <div className="text-xs" style={{ color: rootFolderName ? 'var(--green)' : 'var(--text-secondary)' }}>
              {rootFolderName ? `✓ ${rootFolderName} — 폴더 구조 자동 생성` : isSupported ? '폴더 선택 후 자동 저장됩니다' : 'Chrome에서 폴더 자동 저장 지원'}
            </div>
          </div>
          {isSupported && (
            <button onClick={selectRootFolder} className="px-3 py-1.5 text-xs font-bold rounded-[8px] text-white" style={{ background: rootFolderName ? 'var(--bg-input)' : 'var(--accent)', color: rootFolderName ? 'var(--text-primary)' : '#fff', border: rootFolderName ? '1px solid var(--border)' : 'none' }}>
              {rootFolderName ? '변경' : '폴더 선택'}
            </button>
          )}
        </div>
        {rootFolderName && selectedStation && (
          <div className="mt-2 text-[11px] px-3 py-1.5 rounded-[6px] font-mono" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>
            {rootFolderName}/{selectedStation.base_name}/{date.slice(0,4)}/{date.slice(5,7)}/{inspectionType}점검/파일명.xlsx
          </div>
        )}
      </div>

      <div className="toss-card space-y-6">
        {/* 충전소 */}
        <div>
          <div className="section-label">충전소 선택</div>
          <div className="relative">
            <input className="toss-input" placeholder="충전소명 검색..." value={stationQuery}
              onChange={e => { setStationQuery(e.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)} />
            {dropdownOpen && filtered.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-50 mt-1.5 rounded-[12px] p-1.5 shadow-xl"
                style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-hover)' }}>
                {filtered.map(g => (
                  <button key={g.base_name} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-left transition-colors"
                    style={{ ':hover': { background: 'var(--bg-card)' } } as any}
                    onClick={() => { setSelectedStation(stations.find(s => s.base_name === g.base_name) ?? null); setStationQuery(g.base_name); setDropdownOpen(false); }}>
                    <span className="w-2 h-2 rounded-full bg-[#05C072]" />
                    <div className="flex-1"><div className="text-sm font-semibold">{g.base_name}</div><div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{g.total_capacity}kW · {g.unit_count}기</div></div>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-md" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>{g.voltage}V</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedStation && (
            <div className="mt-2.5 grid grid-cols-3 gap-2 p-3.5 rounded-[10px]" style={{ background: 'var(--bg-elevated)', border: '1.5px solid var(--accent)' }}>
              {[['충전소명', selectedStation.base_name, false], ['수전전압', `${selectedStation.voltage}V`, true], ['수전용량', `${selectedStation.capacity}kW`, true]].map(([l, v, a]) => (
                <div key={String(l)}><div className="text-[10px] mb-0.5" style={{ color: 'var(--text-secondary)' }}>{l}</div><div className="text-sm font-bold" style={{ color: a ? 'var(--accent)' : 'var(--text-primary)' }}>{v}</div></div>
              ))}
            </div>
          )}
        </div>

        {/* 점검 정보 */}
        <div>
          <div className="section-label">점검 정보</div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {TYPE_OPTIONS.map(t => (
              <button key={t.value} onClick={() => setInspectionType(t.value)}
                className="py-3 rounded-[10px] text-sm font-semibold text-center transition-all"
                style={{ border: `1.5px solid ${inspectionType === t.value ? 'var(--accent)' : 'var(--border)'}`, background: inspectionType === t.value ? 'var(--accent-soft)' : 'var(--bg-input)', color: inspectionType === t.value ? 'var(--accent)' : 'var(--text-secondary)' }}>
                {t.label}<span className="block text-[10px] opacity-70 mt-0.5 font-normal">{t.months}</span>
              </button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="block text-sm font-semibold mb-1.5">점검일자</label><input type="date" className="toss-input" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label className="block text-sm font-semibold mb-1.5">점검자</label><input type="text" className="toss-input" placeholder="이름" value={inspectorName} onChange={e => setInspectorName(e.target.value)} /></div>
            <div><label className="block text-sm font-semibold mb-1.5">점검횟수</label><input type="number" className="toss-input" min={1} value={count} onChange={e => setCount(Number(e.target.value))} /></div>
          </div>
        </div>

        {/* 측정값 */}
        <div>
          <div className="section-label">측정값 입력</div>
          <div className="space-y-4">
            <MeasureRow label="전압 (V)" unit="V" keys={['voltage_A1','voltage_B1','voltage_C1','voltage_N1']} values={measures} onChange={updateMeasure} />
            <MeasureRow label="전류 (A)" unit="A" keys={['current_A1','current_B1','current_C1','current_N1']} values={measures} onChange={updateMeasure} />
          </div>
        </div>

        {/* 특이사항 */}
        <div>
          <label className="block text-sm font-semibold mb-1.5">특이사항</label>
          <textarea className="toss-input resize-none" rows={3} placeholder="특이사항없음 (비워두면 자동 입력)" value={remarks} onChange={e => setRemarks(e.target.value)} />
        </div>

        {/* 파일명 미리보기 */}
        {selectedStation && (
          <div className="px-3 py-2.5 rounded-[10px] text-sm" style={{ background: 'var(--bg-elevated)' }}>
            <span style={{ color: 'var(--text-secondary)' }}>생성 파일: </span>
            <span className="font-semibold" style={{ color: 'var(--accent)' }}>{selectedStation.base_name}_{inspectionType}점검_{date}.xlsx</span>
          </div>
        )}

        <button className="toss-btn-primary" onClick={handleCreate}
          disabled={loading || fsStatus === 'saving' || fsStatus === 'picking'}
          style={{ opacity: loading ? 0.7 : 1 }}>
          {loading ? '⏳ 생성 중...' : '⚡ 직무고시 엑셀 생성 및 저장'}
        </button>
      </div>
    </div>
  );
}
