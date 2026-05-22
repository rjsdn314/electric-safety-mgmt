'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';

const TYPE_OPTIONS = [
  { value: '월차', months: '1,2,4,5,7,8,12월' },
  { value: '분기', months: '3, 9월' },
  { value: '반기', months: '3, 9월' },
  { value: '연차', months: '11월' },
];

export function InspectionForm() {
  const [stations, setStations] = useState<any[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [inspType, setInspType] = useState('월차');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [inspector, setInspector] = useState('');
  const [count, setCount] = useState(1);
  const [measures, setMeasures] = useState<any>({});
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
        dbReq.onupgradeneeded = () => {
          dbReq.result.createObjectStore('folders');
        };
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
                } else if (perm === 'prompt') {
                  // 권한 다시 요청
                  const newPerm = await getReq.result.requestPermission({ mode: 'readwrite' });
                  if (newPerm === 'granted') {
                    setFolderHandle(getReq.result);
                    setFolderName(getReq.result.name);
                  }
                }
              } catch(e) { console.log('폴더 복원 실패', e); }
            }
          };
        };
      } catch(e) { console.log('IndexedDB 오류', e); }
    };
    load();
  }, []);

  const filtered = stations.filter(s =>
    !query || s.name?.includes(query) || s.base_name?.includes(query)
  );

  const selectFolder = async () => {
    if (!('showDirectoryPicker' in window)) {
      alert('이 기능은 데스크톱 Chrome/Edge에서만 작동합니다.\n폰에서는 클라우드 저장만 됩니다.');
      return;
    }
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setFolderHandle(handle);
      setFolderName(handle.name);
      
      try {
        const dbReq = indexedDB.open('inspection-app', 1);
        dbReq.onupgradeneeded = () => {
          dbReq.result.createObjectStore('folders');
        };
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
    if (!folderHandle) {
      console.log('폴더 핸들 없음');
      return false;
    }
    try {
      // 권한 재확인
      const perm = await folderHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const newPerm = await folderHandle.requestPermission({ mode: 'readwrite' });
        if (newPerm !== 'granted') {
          alert('폴더 쓰기 권한이 필요합니다.');
          return false;
        }
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
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
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
          date, inspector_name: inspector, count,
          ...measures,
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

  // 토스 스타일 공통 스타일
  const sectionTitle: React.CSSProperties = {
    fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
    marginBottom: 14
  };
  
  const labelStyle: React.CSSProperties = {
    display:'block', fontSize:13, fontWeight:500, marginBottom:8, color:'var(--text-secondary)'
  };

  if (done) return (
    <div style={{maxWidth: 640, margin: '0 auto', padding: '0 16px'}}>
      <div style={{background:'linear-gradient(135deg,rgba(5,192,114,.08),rgba(49,130,246,.08))',border:'1px solid rgba(5,192,114,.3)',borderRadius:20,padding:32,textAlign:'center'}}>
        <div style={{fontSize:56}}>✅</div>
        <h2 style={{fontSize:20,fontWeight:800,margin:'12px 0 8px'}}>저장 완료</h2>
        <div style={{color:'var(--accent)',fontWeight:600,marginBottom:8,fontSize:14,wordBreak:'break-all'}}>📄 {savedFile}</div>
        {folderName && (
          <div style={{fontSize:12,color:'var(--text-secondary)',marginBottom:20}}>
            💾 로컬 저장: {folderName}
          </div>
        )}
        {downloadUrl && (
          <a href={downloadUrl} download={savedFile} style={{
            display:'block', background:'var(--accent)', color:'#fff',
            border:'none', borderRadius:12, padding:'14px 24px', fontSize:15,
            fontWeight:700, textDecoration:'none', marginBottom: 10
          }}>
            ⬇️ 엑셀 다운로드
          </a>
        )}
        <button onClick={()=>{setDone(false);setSelected(null);setQuery('');setMeasures({});setRemarks('');}}
          style={{width:'100%',background:'transparent',color:'var(--text-secondary)',border:'1px solid var(--border)',borderRadius:12,padding:'14px 24px',fontSize:14,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
          새 점검 생성
        </button>
      </div>
    </div>
  );

  return (
    <div style={{maxWidth: 640, margin: '0 auto', padding: '0 16px 24px'}}>
      
      {/* 저장 폴더 카드 - 토스 스타일 */}
      <div style={{
        background: 'var(--bg-card)', borderRadius: 16, padding: 16,
        display:'flex',alignItems:'center',gap:12,marginBottom:12
      }}>
        <div style={{
          width:42,height:42,borderRadius:12,
          background:folderHandle?'rgba(5,192,114,.15)':'var(--bg-elevated)',
          display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0
        }}>📁</div>
        <div style={{minWidth:0,flex:1}}>
          <div style={{fontSize:14,fontWeight:700,marginBottom:2}}>저장 폴더</div>
          <div style={{fontSize:12,color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
            {folderName ? `${folderName}` : '폴더 선택 후 자동 저장'}
          </div>
        </div>
        <button onClick={selectFolder} style={{
          padding:'10px 16px',borderRadius:10,border:'none',
          background:'var(--accent)',color:'#fff',fontSize:13,fontWeight:700,
          cursor:'pointer',flexShrink:0,fontFamily:'inherit'
        }}>
          {folderHandle ? '변경' : '선택'}
        </button>
      </div>

      {/* 충전소 선택 카드 */}
      <div style={{background: 'var(--bg-card)', borderRadius: 16, padding: 20, marginBottom: 12}}>
        <div style={sectionTitle}>충전소 선택</div>
        <div style={{position:'relative'}}>
          <input className="toss-input" placeholder="충전소명 검색..."
            value={query}
            onChange={e=>{setQuery(e.target.value);setOpen(true);}}
            onFocus={()=>setOpen(true)}
            style={{fontSize:15}}
          />
          {open && filtered.length > 0 && (
            <div style={{position:'absolute',top:'calc(100% + 6px)',left:0,right:0,zIndex:50,background:'var(--bg-elevated)',border:'1px solid var(--border-hover)',borderRadius:14,padding:6,boxShadow:'0 8px 32px rgba(0,0,0,.4)',maxHeight:280,overflowY:'auto'}}>
              {filtered.map(s => (
                <button key={s.id}
                  style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'12px 14px',borderRadius:10,border:'none',background:'transparent',color:'var(--text-primary)',cursor:'pointer',textAlign:'left'}}
                  onClick={()=>{setSelected(s);setQuery(s.name);setOpen(false);}}>
                  <span style={{width:8,height:8,borderRadius:'50%',background:'#05C072',flexShrink:0}}/>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:14,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
                    <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>{s.voltage}V · {s.capacity}kW</div>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:8,background:'var(--accent-soft)',color:'var(--accent)',flexShrink:0}}>{s.voltage >= 3000 ? '고압' : '저압'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {selected && (
          <div style={{marginTop:12,padding:14,background:'var(--bg-elevated)',borderRadius:12}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:8,color:'var(--accent)'}}>{selected.name}</div>
            <div style={{display:'flex',gap:16,fontSize:12,color:'var(--text-secondary)'}}>
              <div><span style={{opacity:0.7}}>수전전압</span> <strong style={{color:'var(--text-primary)',marginLeft:4}}>{selected.voltage}V</strong></div>
              <div><span style={{opacity:0.7}}>수전용량</span> <strong style={{color:'var(--text-primary)',marginLeft:4}}>{selected.capacity}kW</strong></div>
            </div>
          </div>
        )}
      </div>

      {/* 점검 정보 카드 */}
      <div style={{background: 'var(--bg-card)', borderRadius: 16, padding: 20, marginBottom: 12}}>
        <div style={sectionTitle}>점검 정보</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:16}}>
          {TYPE_OPTIONS.map(t=>(
            <button key={t.value} onClick={()=>setInspType(t.value)}
              style={{
                padding:'14px 4px',borderRadius:12,
                border:`1.5px solid ${inspType===t.value?'var(--accent)':'transparent'}`,
                background:inspType===t.value?'var(--accent-soft)':'var(--bg-input)',
                color:inspType===t.value?'var(--accent)':'var(--text-secondary)',
                fontSize:14,fontWeight:700,cursor:'pointer',textAlign:'center',fontFamily:'inherit'
              }}>
              {t.value}
              <div style={{fontSize:10,opacity:.7,marginTop:4,fontWeight:500}}>{t.months}</div>
            </button>
          ))}
        </div>
        <div>
          <label style={labelStyle}>점검일자</label>
          <input type="date" className="toss-input" value={date} onChange={e=>setDate(e.target.value)} style={{fontSize:15,marginBottom:14}}/>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
            <div>
              <label style={labelStyle}>점검자</label>
              <input className="toss-input" placeholder="이름" value={inspector} onChange={e=>setInspector(e.target.value)} style={{fontSize:15}}/>
            </div>
            <div>
              <label style={labelStyle}>점검횟수</label>
              <input type="number" className="toss-input" min={1} value={count} onChange={e=>setCount(Number(e.target.value))} style={{fontSize:15}}/>
            </div>
          </div>
        </div>
      </div>

      {/* 측정값 카드 */}
      <div style={{background: 'var(--bg-card)', borderRadius: 16, padding: 20, marginBottom: 12}}>
        <div style={sectionTitle}>측정값 입력</div>
        {[
          {label:'전압 (V)',unit:'V',keys:['voltage_A1','voltage_B1','voltage_C1','voltage_N1']},
          {label:'전류 (A)',unit:'A',keys:['current_A1','current_B1','current_C1','current_N1']}
        ].map(row=>(
          <div key={row.label} style={{marginBottom:16}}>
            <label style={labelStyle}>{row.label}</label>
            <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:8}}>
              {['A상','B상','C상','N'].map((ph,i)=>(
                <div key={ph} style={{position:'relative'}}>
                  <input type="number" inputMode="decimal" className="toss-input" placeholder={ph} 
                    style={{paddingRight:32,fontSize:15}}
                    value={measures[row.keys[i]]??''}
                    onChange={e=>setMeasures((prev:any)=>({...prev,[row.keys[i]]:e.target.value===''?undefined:Number(e.target.value)}))}/>
                  <span style={{position:'absolute',right:12,top:'50%',transform:'translateY(-50%)',fontSize:13,color:'var(--text-secondary)',pointerEvents:'none',fontWeight:600}}>{row.unit}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* 특이사항 카드 */}
      <div style={{background: 'var(--bg-card)', borderRadius: 16, padding: 20, marginBottom: 12}}>
        <label style={sectionTitle}>특이사항</label>
        <textarea className="toss-input" rows={3} style={{resize:'none',fontSize:15}} placeholder="특이사항이 없으면 비워두세요"
          value={remarks} onChange={e=>setRemarks(e.target.value)}/>
      </div>

      {/* 파일명 미리보기 */}
      {selected && (
        <div style={{padding:14,background:'var(--bg-elevated)',borderRadius:12,fontSize:12,marginBottom:12}}>
          <div style={{color:'var(--text-secondary)',marginBottom:4,fontSize:11}}>생성될 파일</div>
          <div style={{color:'var(--accent)',fontWeight:700,wordBreak:'break-all',fontSize:13}}>
            {selected.name}_{inspType}점검_{date.replace(/-/g,'')}.xlsx
          </div>
        </div>
      )}

      {/* 생성 버튼 */}
      <button onClick={handleSubmit} disabled={loading}
        style={{
          width:'100%',padding:16,borderRadius:14,border:'none',
          background:'var(--accent)',color:'#fff',fontSize:16,fontWeight:700,
          cursor:'pointer',opacity:loading?.6:1,fontFamily:'inherit'
        }}>
        {loading ? '⏳ 생성 중...' : '⚡ 직무고시 엑셀 생성 및 저장'}
      </button>
    </div>
  );
}