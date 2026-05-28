'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const TYPE_OPTIONS = [
  { value: '월차', months: '1,2,4,5,7,8,12월' },
  { value: '분기', months: '3, 9월' },
  { value: '반기', months: '3, 9월' },
  { value: '연차', months: '11월' },
  ];

const emptyMeasureSet = () => ({
    voltage_A: '', voltage_B: '', voltage_C: '', voltage_N: '',
    current_A: '', current_B: '', current_C: '',
    remarks: '',
});

export function InspectionForm() {
    const [stations, setStations] = useState<any[]>([]);
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [selected, setSelected] = useState<any>(null);
    const [inspType, setInspType] = useState('월차');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [inspector, setInspector] = useState('');
    const [count, setCount] = useState(1);
    const [measureSets, setMeasureSets] = useState<any[]>([emptyMeasureSet()]);
    const [remarks, setRemarks] = useState('');
    const [loading, setLoading] = useState(false);
    const [done, setDone] = useState(false);
    const [savedFile, setSavedFile] = useState('');
    const [downloadUrl, setDownloadUrl] = useState('');
    const [folderHandle, setFolderHandle] = useState<any>(null);
    const [folderName, setFolderName] = useState('');

  useEffect(() => {
        const load = async () => {
                const sb = createClient();
                const { data: { user } } = await sb.auth.getUser();
                if (user) {
                          const { data: profile } = await sb
                            .from('profiles')
                            .select('inspector_name, name, sector_id')
                            .eq('id', user.id)
                            .single();
                          if (profile?.inspector_name) setInspector(profile.inspector_name);
                          else if (profile?.name) setInspector(profile.name);

                  let q = sb.from('stations').select('*').eq('is_active', true).order('name');
                          if (profile?.sector_id) q = q.eq('sector_id', profile.sector_id);
                          const { data } = await q;
                          setStations(data || []);
                }

                try {
                          const dbReq = indexedDB.open('inspection-app', 1);
                          dbReq.onupgradeneeded = () => { dbReq.result.createObjectStore('folders'); };
                          dbReq.onsuccess = async () => {
                                      const db = dbReq.result;
                                      const tx = db.transaction('folders', 'readonly');
                                      const store = tx.objectStore('folders');
                                      const getReq = store.get('savedFolder');
                                      getReq.onsuccess = async () => {
                                                    if (getReq.result) {
                                                                    try {
                                                                                      const perm = await getReq.result.queryPermission({ mode: 'readwrite' });
                                                                                      if (perm === 'granted') {
                                                                                                          setFolderHandle(getReq.result);
                                                                                                          setFolderName(getReq.result.name);
                                                                                        }
                                                                    } catch(e) {}
                                                    }
                                      };
                          };
                } catch(e) {}
        };
        load();
  }, []);

  const handleSelectStation = (station: any) => {
        setSelected(station);
        setQuery(station.name);
        setOpen(false);
        const panelCount = station.panel_count && station.panel_count > 0 ? station.panel_count : 1;
        setMeasureSets(Array.from({ length: panelCount }, () => emptyMeasureSet()));
  };

  const filtered = stations.filter(s =>
        !query || s.name?.includes(query) || s.base_name?.includes(query)
                                     );

  const updateMeasureSet = (index: number, field: string, value: string) => {
        setMeasureSets(prev => {
                const next = [...prev];
                next[index] = { ...next[index], [field]: value };
                return next;
        });
  };

  const addMeasureSet = () => {
        setMeasureSets(prev => [...prev, emptyMeasureSet()]);
  };

  const removeMeasureSet = (index: number) => {
        if (measureSets.length <= 1) return;
        setMeasureSets(prev => prev.filter((_, i) => i !== index));
  };

  const selectFolder = async () => {
        if (!('showDirectoryPicker' in window)) {
                alert('이 기능은 데스크톱 Chrome/Edge에서만 작동합니다.');
                return;
        }
        try {
                // @ts-ignore
          const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                setFolderHandle(handle);
                setFolderName(handle.name);
                try {
                          const dbReq = indexedDB.open('inspection-app', 1);
                          dbReq.onupgradeneeded = () => { dbReq.result.createObjectStore('folders'); };
                          dbReq.onsuccess = () => {
                                      const db = dbReq.result;
                                      const tx = db.transaction('folders', 'readwrite');
                                      tx.objectStore('folders').put(handle, 'savedFolder');
                          };
                } catch(e) {}
                alert(`✅ 폴더 저장 완료\n\n${handle.name}\n\n이제부터 모든 점검은 이 폴더에 자동 저장됩니다.`);
        } catch (e: any) {
                if (e.name !== 'AbortError') alert('폴더 선택 실패: ' + e.message);
        }
  };

  const normalize = (s: string) => s.replace(/[\s()\-_.]/g, '').toLowerCase();

  const findOrCreateDir = async (parent: any, targetName: string) => {
        const normTarget = normalize(targetName);
        for await (const entry of parent.values()) {
                if (entry.kind === 'directory' && normalize(entry.name).includes(normTarget)) {
                          return await parent.getDirectoryHandle(entry.name);
                }
        }
        return await parent.getDirectoryHandle(targetName, { create: true });
  };

  const saveToLocal = async (base64: string, folderInfo: any, fileName: string) => {
        if (!folderHandle) return false;
        try {
                const perm = await folderHandle.queryPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                          const newPerm = await folderHandle.requestPermission({ mode: 'readwrite' });
                          if (newPerm !== 'granted') { alert('폴더 쓰기 권한이 필요합니다.'); return false; }
                }
                const yyyy = folderInfo.year.replace('년', '');
                const mm = folderInfo.month.replace('월', '');
                const periodFolder = `${yyyy}${mm}${folderInfo.inspection_type}`;
                let current = folderHandle;
                if (folderInfo.is_kintex) {
                          current = await findOrCreateDir(current, folderInfo.base_name);
                          current = await current.getDirectoryHandle(folderInfo.voltage_type, { create: true });
                          current = await current.getDirectoryHandle(periodFolder, { create: true });
                } else {
                          current = await findOrCreateDir(current, folderInfo.base_name);
                          current = await current.getDirectoryHandle(periodFolder, { create: true });
                }
                const fileHandle = await current.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                const binaryString = atob(base64);
                const bytes = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
                await writable.write(bytes);
                await writable.close();
                return true;
        } catch (e: any) {
                console.error('로컬 저장 실패:', e);
                alert('로컬 저장 실패: ' + e.message);
                return false;
        }
  };

  const handleSubmit = async () => {
        if (!selected) return alert('충전소를 선택해주세요');
        if (!inspector) return alert('점검자를 입력해주세요');
        setLoading(true);
        try {
                const res = await fetch('/api/inspection/create', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                                      station_id: selected.id,
                                      inspection_type: inspType,
                                      date,
                                      inspector_name: inspector,
                                      count,
                                      measure_sets: measureSets,
                                      remarks: remarks || '특이사항없음',
                          }),
                });
                const result = await res.json();
                if (!res.ok) throw new Error(result.error);
                if (folderHandle && result.fileBase64 && result.folderInfo) {
                          await saveToLocal(result.fileBase64, result.folderInfo, result.fileName);
                }
                setSavedFile(result.fileName);
                setDownloadUrl(result.downloadUrl);
                setDone(true);
        } catch(e: any) {
                alert('오류: ' + e.message);
        } finally {
                setLoading(false);
        }
  };

  const sectionTitle: React.CSSProperties = {
        fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16
  };
    const labelStyle: React.CSSProperties = {
          display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)'
    };

  if (done) return (
        <div style={{maxWidth: 900, margin: '0 auto', padding: '0 24px'}}>
                <div style={{background:'linear-gradient(135deg,rgba(5,192,114,.08),rgba(49,130,246,.08))',border:'1px solid rgba(5,192,114,.3)',borderRadius:20,padding:40,textAlign:'center'}}>
                          <div style={{fontSize:64}}>✅</div>
                          <h2 style={{fontSize:22,fontWeight:800,margin:'14px 0 10px'}}>저장 완료</h2>h2>
                          <div style={{color:'var(--accent)',fontWeight:600,marginBottom:8,fontSize:15,wordBreak:'break-all'}}>📄 {savedFile}</div>
                  {folderName && (
                    <div style={{fontSize:13,color:'var(--text-secondary)',marginBottom:24}}>
                                  💾 로컬 저장: {folderName}
                    </div>
                  )}
                  {downloadUrl && (
                    <a href={downloadUrl} download={savedFile} style={{
                                  display:'block',background:'var(--accent)',color:'#fff',
                                  border:'none',borderRadius:12,padding:'16px 24px',fontSize:15,
                                  fontWeight:700,textDecoration:'none',marginBottom:10,
                                  maxWidth:400,marginLeft:'auto',marginRight:'auto'
                    }}>
                                  ⬇️ 엑셀 다운로드
                    </a>a>
                  )}
                          <button onClick={()=>{setDone(false);setSelected(null);setQuery('');setMeasureSets([emptyMeasureSet()]);setRemarks('');}}
                                      style={{width:'100%',maxWidth:400,background:'transparent',color:'var(--text-secondary)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 24px',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                                      새 점검 생성
                          </button>button>
                </div>
        </div>
      );

  return (
        <div style={{maxWidth: 900, margin: '0 auto', padding: '0 24px 24px'}}>

          {/* 저장 폴더 */}
                <div style={{background:'var(--bg-card)',borderRadius:16,padding:18,display:'flex',alignItems:'center',gap:14,marginBottom:14}}>
                          <div style={{width:44,height:44,borderRadius:12,background:folderHandle?'rgba(5,192,114,.15)':'var(--bg-elevated)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,flexShrink:0}}>📁</div>
                          <div style={{minWidth:0,flex:1}}>
                                      <div style={{fontSize:14,fontWeight:700,marginBottom:3}}>저장 폴더</div>
                                      <div style={{fontSize:12,color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                                        {folderName ? `${folderName}` : '폴더 선택 후 자동 저장'}
                                      </div>
                          </div>
                          <button onClick={selectFolder} style={{padding:'10px 18px',borderRadius:10,border:'none',background:'var(--accent)',color:'#fff',fontSize:13,fontWeight:700,cursor:'pointer',flexShrink:0,fontFamily:'inherit'}}>
                            {folderHandle ? '변경' : '선택'}
                          </button>button>
                </div>

          {/* 충전소 선택 */}
                <div style={{background:'var(--bg-card)',borderRadius:16,padding:24,marginBottom:14}}>
                          <div style={sectionTitle}>충전소 선택</div>
                          <div style={{position:'relative'}}>
                                      <input className="toss-input" placeholder="충전소명 검색..."
                                                    value={query}
                                                    onChange={e=>{setQuery(e.target.value);setOpen(true);}}
                                                    onFocus={()=>setOpen(true)}
                                                  />
                            {open && filtered.length > 0 && (
                      <div style={{position:'absolute',top:'calc(100% + 6px)',left:0,right:0,zIndex:50,background:'var(--bg-elevated)',border:'1px solid var(--border-hover)',borderRadius:14,padding:6,boxShadow:'0 8px 32px rgba(0,0,0,.4)',maxHeight:320,overflowY:'auto'}}>
                        {filtered.map(s => (
                                        <button key={s.id}
                                                            style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:10,border:'none',background:'transparent',color:'var(--text-primary)',cursor:'pointer',textAlign:'left'}}
                                                            onClick={()=>handleSelectStation(s)}>
                                                            <span style={{width:8,height:8,borderRadius:'50%',background:'#05C072',flexShrink:0}}/>
                                                            <div style={{flex:1,minWidth:0}}>
                                                                                  <div style={{fontSize:14,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
                                                                                  <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>{s.voltage}V · {s.capacity}kW</div>
                                                            </div>
                                                            <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:8,background:'var(--accent-soft)',color:'var(--accent)',flexShrink:0}}>{s.voltage >= 3000 ? '고압' : '저압'}</span>span>
                                        </button>button>
                                      ))}
                      </div>
                    )}
                          </div>
                  {selected && (
                    <div style={{marginTop:14,padding:18,background:'var(--bg-elevated)',borderRadius:12}}>
                                  <div style={{fontSize:14,fontWeight:700,marginBottom:10,color:'var(--accent)'}}>{selected.name}</div>
                                  <div style={{display:'flex',gap:24,fontSize:13,color:'var(--text-secondary)',flexWrap:'wrap'}}>
                                                  <div><span style={{opacity:0.7}}>수전전압</span>span> <strong style={{color:'var(--text-primary)',marginLeft:6}}>{selected.voltage}V</strong>strong></div>
                                                <div><span style={{opacity:0.7}}>수전용량</span>span> <strong style={{color:'var(--text-primary)',marginLeft:6}}>{selected.capacity}kW</strong>strong></div>
                                    {selected.panel_count > 1 && (
                                      <div><span style={{opacity:0.7}}>수배전반</span>span> <strong style={{color:'var(--accent)',marginLeft:6}}>{selected.panel_count}개</strong>strong></div>
                                                )}
                                  </div>
                    </div>
                        )}
                </div>
        
          {/* 점검 정보 */}
              <div style={{background:'var(--bg-card)',borderRadius:16,padding:24,marginBottom:14}}>
                      <div style={sectionTitle}>점검 정보</div>
                      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:18}}>
                        {TYPE_OPTIONS.map(t=>(
                      <button key={t.value} onClick={()=>setInspType(t.value)}
                                      style={{padding:'16px 4px',borderRadius:12,border:`1.5px solid ${inspType===t.value?'var(--accent)':'transparent'}`,background:inspType===t.value?'var(--accent-soft)':'var(--bg-input)',color:inspType===t.value?'var(--accent)':'var(--text-secondary)',fontSize:15,fontWeight:700,cursor:'pointer',textAlign:'center',fontFamily:'inherit'}}>
                        {t.value}
                                    <div style={{fontSize:11,opacity:.7,marginTop:4,fontWeight:500}}>{t.months}</div>
                      </button>button>
                    ))}
                      </div>
                      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:14}} className="info-grid">
                                <div>
                                            <label style={labelStyle}>점검일자</label>label>
                                            <input type="date" className="toss-input" value={date} onChange={e=>setDate(e.target.value)}/>
                                </div>
                                <div>
                                            <label style={labelStyle}>점검자</label>label>
                                            <input className="toss-input" placeholder="이름" value={inspector} onChange={e=>setInspector(e.target.value)}/>
                                </div>
                                <div>
                                            <label style={labelStyle}>점검횟수</label>label>
                                            <input type="number" className="toss-input" min={1} value={count} onChange={e=>setCount(Number(e.target.value))}/>
                                </div>
                      </div>
              </div>
        
          {/* 측정값 입력 — 개소별 동적 */}
              <div style={{background:'var(--bg-card)',borderRadius:16,padding:24,marginBottom:14}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16}}>
                                <div style={sectionTitle}>측정값 입력</div>
                                <button onClick={addMeasureSet}
                                              style={{display:'flex',alignItems:'center',gap:6,padding:'8px 16px',borderRadius:10,border:'1.5px dashed var(--accent)',background:'var(--accent-soft)',color:'var(--accent)',fontSize:13,fontWeight:700,cursor:'pointer',fontFamily:'inherit'}}>
                                            + 개소 추가
                                </button>button>
                      </div>
              
                {measureSets.map((set, idx) => (
                    <div key={idx} style={{marginBottom: idx < measureSets.length - 1 ? 28 : 0}}>
                                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:14}}>
                                              <div style={{fontSize:13,fontWeight:700,color:'var(--accent)',padding:'4px 12px',borderRadius:8,background:'var(--accent-soft)'}}>
                                                              수배전반 #{idx + 1}
                                              </div>
                                  {measureSets.length > 1 && (
                                      <button onClick={()=>removeMeasureSet(idx)}
                                                          style={{padding:'4px 12px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-secondary)',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                                                        ✕ 제거
                                      </button>button>
                                              )}
                                </div>
                    
                                <div style={{marginBottom:14}}>
                                              <label style={labelStyle}>전압 (V)</label>label>
                                              <div className="measure-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                                                {(['A','B','C','N'] as const).map((phase) => (
                                        <div key={phase} style={{position:'relative'}}>
                                                            <input type="number" inputMode="decimal" className="toss-input"
                                                                                    placeholder={phase === 'N' ? 'N' : `${phase}상`}
                                                                                    style={{paddingRight:36}}
                                                                                    value={set[`voltage_${phase}`] ?? ''}
                                                                                    onChange={e=>updateMeasureSet(idx, `voltage_${phase}`, e.target.value)}
                                                                                  />
                                                            <span style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'var(--text-secondary)',pointerEvents:'none',fontWeight:600}}>V</span>span>
                                        </div>
                                      ))}
                                              </div>
                                </div>
                    
                                <div style={{marginBottom:14}}>
                                              <label style={labelStyle}>전류 (A)</label>label>
                                              <div className="measure-grid" style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                                                {(['A','B','C'] as const).map((phase) => (
                                        <div key={phase} style={{position:'relative'}}>
                                                            <input type="number" inputMode="decimal" className="toss-input"
                                                                                    placeholder={`${phase}상`}
                                                                                    style={{paddingRight:36}}
                                                                                    value={set[`current_${phase}`] ?? ''}
                                                                                    onChange={e=>updateMeasureSet(idx, `current_${phase}`, e.target.value)}
                                                                                  />
                                                            <span style={{position:'absolute',right:14,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'var(--text-secondary)',pointerEvents:'none',fontWeight:600}}>A</span>span>
                                        </div>
                                      ))}
                                                              <div />
                                              </div>
                                </div>
                    
                                <div>
                                              <label style={labelStyle}>특이사항 (수배전반 #{idx + 1})</label>label>
                                              <input className="toss-input" placeholder="특이사항이 없으면 비워두세요"
                                                                value={set.remarks ?? ''}
                                                                onChange={e=>updateMeasureSet(idx, 'remarks', e.target.value)}
                                                              />
                                </div>
                    
                      {idx < measureSets.length - 1 && (
                                    <div style={{borderTop:'1px solid var(--border)',marginTop:20}}/>
                                  )}
                    </div>
                  ))}
              </div>
        
          {/* 전체 특이사항 */}
              <div style={{background:'var(--bg-card)',borderRadius:16,padding:24,marginBottom:14}}>
                      <label style={sectionTitle}>전체 특이사항</label>label>
                      <textarea className="toss-input" rows={3} style={{resize:'none'}} placeholder="특이사항이 없으면 비워두세요"
                                  value={remarks} onChange={e=>setRemarks(e.target.value)}/>
              </div>
        
          {selected && (
                  <div style={{padding:16,background:'var(--bg-elevated)',borderRadius:12,fontSize:13,marginBottom:14}}>
                            <div style={{color:'var(--text-secondary)',marginBottom:4,fontSize:11}}>생성될 파일</div>
                            <div style={{color:'var(--accent)',fontWeight:700,wordBreak:'break-all'}}>
                              {selected.name}_{inspType}점검_{date.replace(/-/g,'')}.xlsx
                            </div>
                  </div>
              )}
        
              <button onClick={handleSubmit} disabled={loading}
                        style={{width:'100%',padding:18,borderRadius:14,border:'none',background:'var(--accent)',color:'#fff',fontSize:16,fontWeight:700,cursor:'pointer',opacity:loading?.6:1,fontFamily:'inherit'}}>
          {loading ? '⏳ 생성 중...' : '⚡ 직무고시 엑셀 생성 및 저장'}
        </div>button>
    
          <style jsx>{`
                  @media (max-width: 768px) {
                            .info-grid { grid-template-columns: 1fr !important; }
                                      .measure-grid { grid-template-columns: repeat(2, 1fr) !important; }
                                              }
                                                    `}</style>style>
    </div>
      );
      }
