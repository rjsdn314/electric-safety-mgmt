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

  useEffect(() => {
    const load = async () => {
      const sb = createClient();
      const { data, error } = await sb
        .from('stations')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) console.error('오류:', error);
      else console.log('충전소:', data?.length);
      setStations(data || []);
    };
    load();
  }, []);

  const filtered = stations.filter(s =>
    !query || s.name?.includes(query) || s.base_name?.includes(query)
  );

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
      if (!res.ok) throw new Error((await res.json()).error);
      const { fileName } = await res.json();
      setSavedFile(fileName);
      setDone(true);
    } catch(e: any) {
      alert('오류: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  if (done) return (
    <div className="max-w-xl">
      <div style={{background:'linear-gradient(135deg,rgba(5,192,114,.08),rgba(49,130,246,.08))',border:'1px solid rgba(5,192,114,.3)',borderRadius:20,padding:32,textAlign:'center'}}>
        <div style={{fontSize:48}}>✅</div>
        <h2 style={{fontSize:18,fontWeight:800,margin:'12px 0 8px'}}>저장 완료!</h2>
        <div style={{color:'var(--accent)',fontWeight:600,marginBottom:20}}>📄 {savedFile}</div>
        <button onClick={()=>{setDone(false);setSelected(null);setQuery('');setMeasures({});setRemarks('');}}
          style={{background:'var(--accent)',color:'#fff',border:'none',borderRadius:10,padding:'14px 24px',fontSize:15,fontWeight:700,cursor:'pointer',width:'100%'}}>
          새 점검 생성
        </button>
      </div>
    </div>
  );

  return (
    <div style={{maxWidth:640}}>
      <div className="toss-card" style={{display:'flex',flexDirection:'column',gap:24}}>

        {/* 충전소 선택 */}
        <div>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.06em',color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>충전소 선택</div>
          <div style={{position:'relative'}}>
            <input className="toss-input" placeholder="충전소명 검색..."
              value={query}
              onChange={e=>{setQuery(e.target.value);setOpen(true);}}
              onFocus={()=>setOpen(true)}
            />
            {open && filtered.length > 0 && (
              <div style={{position:'absolute',top:'calc(100% + 6px)',left:0,right:0,zIndex:50,background:'var(--bg-elevated)',border:'1px solid var(--border-hover)',borderRadius:12,padding:6,boxShadow:'0 4px 20px rgba(0,0,0,.4)',maxHeight:240,overflowY:'auto'}}>
                {filtered.map(s => (
                  <button key={s.id}
                    style={{width:'100%',display:'flex',alignItems:'center',gap:10,padding:'10px 12px',borderRadius:8,border:'none',background:'transparent',color:'var(--text-primary)',cursor:'pointer',textAlign:'left'}}
                    onMouseEnter={e=>(e.currentTarget.style.background='var(--bg-card)')}
                    onMouseLeave={e=>(e.currentTarget.style.background='transparent')}
                    onClick={()=>{setSelected(s);setQuery(s.name);setOpen(false);}}>
                    <span style={{width:8,height:8,borderRadius:'50%',background:'#05C072',boxShadow:'0 0 5px #05C072',flexShrink:0}}/>
                    <div style={{flex:1}}>
                      <div style={{fontSize:14,fontWeight:600}}>{s.name}</div>
                      <div style={{fontSize:11,color:'var(--text-secondary)'}}>{s.voltage}V · {s.capacity}kW</div>
                    </div>
                    <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:6,background:'var(--accent-soft)',color:'var(--accent)'}}>{s.voltage >= 3000 ? '고압' : '저압'}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selected && (
            <div style={{marginTop:10,display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,padding:14,background:'var(--bg-elevated)',border:'1.5px solid var(--accent)',borderRadius:12}}>
              {[['충전소명',selected.name],['수전전압',selected.voltage+'V'],['수전용량',selected.capacity+'kW']].map(([l,v])=>(
                <div key={String(l)}><div style={{fontSize:10,color:'var(--text-secondary)',marginBottom:2}}>{l}</div><div style={{fontSize:14,fontWeight:700,color:'var(--accent)'}}>{v}</div></div>
              ))}
            </div>
          )}
        </div>

        {/* 점검 정보 */}
        <div>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.06em',color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>점검 정보</div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,marginBottom:12}}>
            {TYPE_OPTIONS.map(t=>(
              <button key={t.value} onClick={()=>setInspType(t.value)}
                style={{padding:'12px 8px',borderRadius:10,border:`1.5px solid ${inspType===t.value?'var(--accent)':'var(--border)'}`,background:inspType===t.value?'var(--accent-soft)':'var(--bg-input)',color:inspType===t.value?'var(--accent)':'var(--text-secondary)',fontSize:13,fontWeight:600,cursor:'pointer',textAlign:'center',fontFamily:'inherit'}}>
                {t.value}<span style={{display:'block',fontSize:10,opacity:.7,marginTop:2,fontWeight:400}}>{t.months}</span>
              </button>
            ))}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:12}}>
            <div><label style={{display:'block',fontSize:13,fontWeight:600,marginBottom:6}}>점검일자</label><input type="date" className="toss-input" value={date} onChange={e=>setDate(e.target.value)}/></div>
            <div><label style={{display:'block',fontSize:13,fontWeight:600,marginBottom:6}}>점검자</label><input className="toss-input" placeholder="이름" value={inspector} onChange={e=>setInspector(e.target.value)}/></div>
            <div><label style={{display:'block',fontSize:13,fontWeight:600,marginBottom:6}}>점검횟수</label><input type="number" className="toss-input" min={1} value={count} onChange={e=>setCount(Number(e.target.value))}/></div>
          </div>
        </div>

        {/* 측정값 */}
        <div>
          <div style={{fontSize:10,fontWeight:700,letterSpacing:'0.06em',color:'var(--text-secondary)',textTransform:'uppercase',marginBottom:12,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>측정값 입력</div>
          {[{label:'전압 (V)',unit:'V',keys:['voltage_A1','voltage_B1','voltage_C1','voltage_N1']},{label:'전류 (A)',unit:'A',keys:['current_A1','current_B1','current_C1','current_N1']}].map(row=>(
            <div key={row.label} style={{marginBottom:16}}>
              <label style={{display:'block',fontSize:13,fontWeight:600,marginBottom:8}}>{row.label}</label>
              <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
                {['A상','B상','C상','N'].map((ph,i)=>(
                  <div key={ph} style={{position:'relative'}}>
                    <input type="number" className="toss-input" placeholder={ph} style={{paddingRight:28,fontSize:13}}
                      value={measures[row.keys[i]]??''}
                      onChange={e=>setMeasures((prev:any)=>({...prev,[row.keys[i]]:e.target.value===''?undefined:Number(e.target.value)}))}/>
                    <span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',fontSize:12,color:'var(--text-secondary)',pointerEvents:'none'}}>{row.unit}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 특이사항 */}
        <div>
          <label style={{display:'block',fontSize:13,fontWeight:600,marginBottom:6}}>특이사항</label>
          <textarea className="toss-input" rows={3} style={{resize:'none'}} placeholder="특이사항없음"
            value={remarks} onChange={e=>setRemarks(e.target.value)}/>
        </div>

        {selected && (
          <div style={{padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:10,fontSize:13}}>
            <span style={{color:'var(--text-secondary)'}}>생성 파일: </span>
            <span style={{color:'var(--accent)',fontWeight:600}}>{selected.name}_{inspType}점검_{date}.xlsx</span>
          </div>
        )}

        <button onClick={handleSubmit} disabled={loading}
          style={{width:'100%',padding:14,borderRadius:10,border:'none',background:'var(--accent)',color:'#fff',fontSize:15,fontWeight:700,cursor:'pointer',opacity:loading?.7:1,fontFamily:'inherit'}}>
          {loading ? '⏳ 생성 중...' : '⚡ 직무고시 엑셀 생성 및 저장'}
        </button>
      </div>
    </div>
  );
}