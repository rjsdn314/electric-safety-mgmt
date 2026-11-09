'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useThermalPanels, ThermalPhotoBox } from './ThermalPhotos';
import { Status, plain } from '@/components/ui/Status';
import { CheckCircle2, FileText, FolderOpen, Folder, Download, Plus, X, Loader2 } from 'lucide-react';

const TYPE_OPTIONS = [
  { value: '월차', months: '1,2,4,5,7,8,10,12월' },
  { value: '분기', months: '3, 9월' },
  { value: '반기', months: '6월' },
  { value: '연차', months: '11월' },
];

// 점검일자의 '월'에 따라 점검유형 자동 결정
//  6월→반기, 11월→연차, 3·9월→분기, 그 외(1,2,4,5,7,8,10,12월)→월차
const typeForMonth = (m: number): string =>
  m === 6 ? '반기' : m === 11 ? '연차' : (m === 3 || m === 9) ? '분기' : '월차';

// 캘린더에 '경상북도'/'경상남도'(지역명)만 적혀 있을 때, 해당 권역 현장으로 자동 확장.
//  · 경북: '1일차'~'3일차' 표기가 있으면 그 날짜 현장만, 없으면 전체.
const GB_DAYS: Record<string, string[]> = {
  '1': ['괴산휴게소(마산방향)', '문경휴게소(창원방향)', '의성휴게소(청주방향)', '안동휴게소(부산방향)', '군위휴게소(부산방향)'],
  '2': ['칠곡휴게소(서울)', '경주휴게소(부산방향)', '영천휴게소(대구방향)', '청통휴게소(대구방향)'],
  '3': ['남성주참외휴게소(양평방향)', '선산휴게소(양평방향)', '문경휴게소(양평방향)', '충주휴게소(양평방향)'],
};
const GN_STATIONS = [
  '거제식물원', '거제시 농업기술 센터', '고현종합시장 공영주차장', '거제 능포수변공원 우측공영주차장',
  '산청휴게소(대전방향)', '영산휴게소(창원방향)', '진주휴게소(부산방향)',
  '함안휴게소(부산방향)-1', '함안휴게소(부산방향)-2', '함안휴게소(순천방향)-1', '함안휴게소(순천방향)-2',
  '고성공룡나라휴게소(대전방향)-1', '고성공룡나라휴게소(대전방향)-2', '고성공룡나라휴게소(통영방향)-1', '고성공룡나라휴게소(통영방향)-2',
  '산청휴게소(통영방향)', '장유휴게소(서부산방향)-1', '장유휴게소(서부산방향)-2', '진영휴게소(순천방향)',
  '김해금관가야휴게소(기장방향)', '김해금관가야휴게소(창원방향)',
];

const emptyMeasureSet = () => ({
  voltage_A: '', voltage_B: '', voltage_C: '', voltage_N: '',
  current_A: '', current_B: '', current_C: '',
  ground: '', remarks: '',
});

// 매칭용 정규화: 영문·숫자·한글만 남기고 공백/괄호/기호(*, /, ·, - 등) 모두 제거
const norm = (s: string) => (s || '').replace(/[^0-9a-z가-힣]/gi, '').toLowerCase();

export function InspectionForm() {
  const [stations, setStations] = useState<any[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [meId, setMeId] = useState<string | null>(null);
  const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
  const [viewOwner, setViewOwner] = useState<string>('mine'); // 'mine' | 회원id | 'all'
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [inspType, setInspType] = useState('월차');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [inspector, setInspector] = useState('');
  const [count, setCount] = useState(1);
  const [weather, setWeather] = useState('자동');
  const [measureSets, setMeasureSets] = useState<any[]>([emptyMeasureSet()]);
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [savedFile, setSavedFile] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [folderHandle, setFolderHandle] = useState<any>(null);
  const [folderName, setFolderName] = useState('');
  const [todayEvents, setTodayEvents] = useState<{ text: string; desc?: string; dayIndex: number; span: number }[]>([]);
  const [result, setResult] = useState<any>(null);
  // 캘린더 오늘 일정 매칭용 전체 현장(관리자 전용) — "내 관리구역" 보기 중이어도
  // 다른 회원 소유 현장이 오늘 일정이면 놓치지 않도록 소유자 필터와 무관하게 별도 로드.
  const [allStationsForCalendar, setAllStationsForCalendar] = useState<any[]>([]);
  // 별지7 열화상: 수배전반 인덱스별 사진·온도·부위 분류 (사진이 없으면 나중에 점검 이력에서 추가)
  const thermalApi = useThermalPanels();
  const thermal = thermalApi.thermal;
  // 저압 현장은 PF/PT/CH 대신 촬영 순서(전경 1장 + 상별 3장) 규칙 사용
  //  + 현장별 부위 설정(양식·설비가 다른 현장) 불러오기
  useEffect(() => {
    thermalApi.setStationContext({ stationId: selected?.id || null, lowVoltage: !!selected && Number(selected.voltage) < 3000 });
  }, [selected]);

  // 최초: 권한·점검자명 설정 + 관리자면 사이트 보유 회원 목록 로드
  useEffect(() => {
    (async () => {
      const sb = createClient();
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      setMeId(user.id);
      const { data: profile } = await sb
        .from('profiles')
        .select('inspector_name, name, sector_id, role')
        .eq('id', user.id)
        .single();
      if (profile?.inspector_name) setInspector(profile.inspector_name);
      else if (profile?.name) setInspector(profile.name);
      const admin = profile?.role === 'admin';
      setIsAdmin(admin);
      if (admin) {
        const { data: owners } = await sb.from('stations').select('user_id').not('user_id', 'is', null);
        const ownerIds = [...new Set((owners || []).map((o: any) => o.user_id))].filter(id => id !== user.id);
        if (ownerIds.length) {
          const { data: profs } = await sb.from('profiles').select('id, name').in('id', ownerIds);
          setMembers((profs || []).map((p: any) => ({ id: p.id, name: p.name || '이름없음' })));
        }
        // 캘린더 매칭용: 소유자 필터 없이 전체 활성 현장 로드
        const { data: all } = await sb.from('stations').select('*').eq('is_active', true).order('name');
        setAllStationsForCalendar(all || []);
      }
    })();
  }, []);

  // 보기 대상(관리자: 내 관리구역=본인+미지정 / 회원별 / 전체)에 따라 충전소 로드
  useEffect(() => {
    if (!meId) return;
    (async () => {
      const sb = createClient();
      let q = sb.from('stations').select('*').eq('is_active', true).order('name');
      if (!isAdmin) q = q.eq('user_id', meId);
      else if (viewOwner === 'mine') q = q.or(`user_id.eq.${meId},user_id.is.null`);
      else if (viewOwner !== 'all') q = q.eq('user_id', viewOwner);
      const { data } = await q;
      setStations(data || []);
    })();
  }, [meId, isAdmin, viewOwner]);

  // 점검일자(월)에 따라 점검유형 자동 선택 — 날짜 변경 시마다 갱신
  useEffect(() => {
    if (!date) return;
    const m = parseInt(date.slice(5, 7), 10);
    if (m >= 1 && m <= 12) setInspType(typeForMonth(m));
  }, [date]);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/calendar/today', { cache: 'no-store' });
        const j = await r.json();
        if (Array.isArray(j.events)) setTodayEvents(j.events);
        else if (Array.isArray(j.titles)) setTodayEvents(j.titles.map((t: string) => ({ text: t, dayIndex: 0, span: 1 })));
      } catch {}
    })();
  }, []);

  const openFolderDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
    const req = indexedDB.open('inspection-app', 1);
    req.onupgradeneeded = () => { req.result.createObjectStore('folders'); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

  const folderKeyByName = (station: any) => {
    const base = (station?.name || station?.base_name || '').trim();
    return 'folderByName_' + base;
  };

  const saveStationFolder = async (station: any, handle: any) => {
    try {
      const db = await openFolderDB();
      const tx = db.transaction('folders', 'readwrite');
      const store = tx.objectStore('folders');
      store.put(handle, folderKeyByName(station));
      if (station?.id) store.put(handle, 'folder_' + station.id);
    } catch (e) {}
  };

  const loadStationFolder = async (station: any) => {
    try {
      const db = await openFolderDB();
      const getOne = (key: string) => new Promise<any>((res) => {
        const tx = db.transaction('folders', 'readonly');
        const r = tx.objectStore('folders').get(key);
        r.onsuccess = () => res(r.result || null);
        r.onerror = () => res(null);
      });
      let result = await getOne(folderKeyByName(station));
      if (!result && station?.id) result = await getOne('folder_' + station.id);
      if (result) {
        try {
          const perm = await result.queryPermission({ mode: 'readwrite' });
          if (perm === 'granted' || perm === 'prompt') {
            setFolderHandle(result);
            setFolderName(result.name);
            await saveStationFolder(station, result);
            return;
          }
        } catch (e) {}
      }
      setFolderHandle(null);
      setFolderName('');
    } catch (e) { setFolderHandle(null); setFolderName(''); }
  };

  const handleSelectStation = (station: any) => {
    setSelected(station);
    setQuery(station.name);
    setOpen(false);
    const panelCount = station.panel_count && station.panel_count > 0 ? station.panel_count : 1;
    setMeasureSets(Array.from({ length: panelCount }, () => emptyMeasureSet()));
    thermalApi.reset();
    loadStationFolder(station);
  };

  const aliasMap: Record<string, string[]> = {
    'KINTEX': ['킨텍스', '킨', '킨텍'],
    'kintex': ['킨텍스', '킨', '킨텍'],
  };

  const buildSearchTerms = (q: string): string[] => {
    if (!q) return [];
    const trimmed = q.trim();
    const lower = trimmed.toLowerCase();
    const terms = new Set<string>([trimmed, lower]);
    for (const [key, aliases] of Object.entries(aliasMap)) {
      for (const alias of aliases) {
        const aliasLower = alias.toLowerCase();
        if (alias.includes(trimmed) || aliasLower.includes(lower) || trimmed.includes(alias) || lower.includes(aliasLower)) {
          terms.add(key); terms.add(key.toLowerCase()); terms.add(key.toUpperCase());
        }
      }
      const keyLower = key.toLowerCase();
      if (keyLower.includes(lower) || lower.includes(keyLower)) {
        aliases.forEach(a => terms.add(a));
      }
    }
    return Array.from(terms);
  };

  const matchStation = (s: any, q: string): boolean => {
    if (!q) return true;
    const terms = buildSearchTerms(q);
    const haystacks = [s.name || '', s.base_name || '', (s.name || '').toLowerCase(), (s.base_name || '').toLowerCase()];
    return terms.some(term => haystacks.some(h => h.includes(term)));
  };

  // 일정 제목 ↔ 충전소명 매칭.
  //  · 한 일정에 여러 현장이 들어갈 수 있어("1일차 / 괴산휴게소(마산방향), 문경휴게소(창원방향), …")
  //    쉼표·슬래시로 구간을 나눠 구간별로 매칭한다.
  //  · "호수공원(1,2,3,4)"처럼 괄호 안 번호목록은 분리 전에 제거(제1~4주차장 모두 매칭).
  //  · 구간 매칭: 전체 포함(양방향) 또는 핵심 토큰(가장 긴 의미 토큰, 예: '영천휴게소') 일치 +
  //    의미 토큰 절반 이상 일치. 'N일차'·'오전/오후/점검' 등 불용어는 무시.
  const STOP_TOKENS = new Set(['오전', '오후', '점검', '월차', '분기', '반기', '연차', '예정', '및', '외']);
  const GENERIC_TOKENS = new Set(['주차장', '휴게소', '충전소', '공영', '제']);
  const isStopToken = (x: string) => STOP_TOKENS.has(x) || /^\d+일차$/.test(x);
  // 캘린더 표기 ↔ DB 표기 차이 별칭 (실제 캘린더 전수 점검으로 발견된 것들. 계속 추가 가능)
  // ⚠ 치환값은 norm() 이후 형태(소문자 영문·한글, 공백 없음)로만 작성할 것 —
  //   ka()는 norm() *다음*에 적용되므로, 대문자·공백이 섞이면 재정규화가 안 돼 매칭이 깨진다.
  const CALENDAR_ALIASES: [RegExp, string][] = [
    [/(킨텍스|킨텍|kintex)\s*제?\s*2\s*주차장/gi, 'kintex제2전시장'],
    [/킨텍스|킨텍/g, 'kintex'],
    [/탄현체육센터/g, '일산탄현마을'],
    [/고양\s*농수산물\s*(종합)?\s*(유통)?\s*센터/g, '농수산물종합유통센터'],
    [/서울시\s*교통회관/g, '서울교통회관'],
    [/워터\s*서피비치/g, '양양서피비치'],
    [/남성주\s*(참외)?\s*휴게소/g, '남성주참외휴게소'],
    [/북한산\s*(국립공원)?\s*제\s*1\s*(공영)?\s*주차장/g, '워터북한산제1주차장'],
  ];
  const ka = (x: string) => { let r = x; for (const [re, to] of CALENDAR_ALIASES) r = r.replace(re, to); return r; };
  // 방향 추출: 마지막 괄호 안 내용(숫자목록 제외) 또는 'X방향' — 예 (양평방향)→양평, (인천)→인천.
  // '양방향'(왕복/전체)은 특정 방향이 아니므로 방향 미지정으로 취급.
  const dirOf = (raw: string): string => {
    const clean = (x: string) => { const d = norm(x.replace(/방향/g, '')); return d === '양' ? '' : d; };
    const parens = [...String(raw).matchAll(/\(([^)]*)\)/g)].map(m => m[1]).filter(p => !/^[\d,\s]*$/.test(p));
    const p = parens.length ? parens[parens.length - 1] : '';
    if (p) return clean(p);
    const m = String(raw).match(/([가-힣]{2,})방향/);
    return m ? clean(m[1]) : '';
  };
  // 이름만으로 매칭(방향 무시) — 캘린더의 방향 오표기(예: '익산방향'인데 DB는 '대구방향') 대비 폴백용
  const nameOnlyMatch = (seg: string, candsRaw: string[]): boolean => {
    const cands = candsRaw.map(c => ka(norm(c)));
    const nt = ka(norm(seg));
    if (!nt) return false;
    if (cands.some(c => nt.includes(c) || c.includes(nt))) return true;
    const tokens = seg.split(/[\s()\[\]·~-]+/).map(x => ka(norm(x))).filter(x => x.length >= 2 && !isStopToken(x));
    if (!tokens.length) return false;
    const specific = tokens.filter(x => !GENERIC_TOKENS.has(x));
    const primary = specific.sort((a, b) => b.length - a.length)[0];
    if (!primary) return false;
    return cands.some(c => {
      if (!c.includes(primary)) return false;
      const hits = tokens.filter(x => c.includes(x));
      return hits.length >= Math.max(1, Math.ceil(tokens.length * 0.5));
    });
  };
  // seg(캘린더 구간) ↔ cand(충전소명, 원문) 매칭. 방향이 서로 다르면 배제(예: 문경 양평 vs 창원).
  const segMatch = (seg: string, candsRaw: string[]): boolean => {
    const segDir = dirOf(seg);
    const cands = candsRaw.map(c => ({ n: ka(norm(c)), dir: dirOf(c) }));
    const okDir = (cd: string) => !segDir || !cd || cd.includes(segDir) || segDir.includes(cd);
    const nt = ka(norm(seg));
    if (!nt) return false;
    if (cands.some(c => okDir(c.dir) && (nt.includes(c.n) || c.n.includes(nt)))) return true;   // 전체 포함(양방향)
    const tokens = seg.split(/[\s()\[\]·~-]+/).map(x => ka(norm(x))).filter(x => x.length >= 2 && !isStopToken(x));
    if (!tokens.length) return false;
    const specific = tokens.filter(x => !GENERIC_TOKENS.has(x));
    const primary = specific.sort((a, b) => b.length - a.length)[0];      // 핵심 토큰(가장 긴 의미 토큰)
    if (!primary) return false;
    return cands.some(c => {
      if (!okDir(c.dir)) return false;
      if (!c.n.includes(primary)) return false;
      const hits = tokens.filter(x => c.n.includes(x));
      return hits.length >= Math.max(1, Math.ceil(tokens.length * 0.5));
    });
  };
  // 괄호 밖의 '/'만 일자 구분자로 분리 (예: "내린천휴게소(양양/서울)"의 /는 유지)
  const splitDaysBySlash = (s: string): string[] => {
    const out: string[] = []; let depth = 0, cur = '';
    for (const ch of s) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      if (ch === '/' && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
    }
    out.push(cur);
    return out.map(x => x.trim()).filter(Boolean);
  };
  // 오늘 일정 → 매칭 대상 '구간' 목록. 다일 출장은 오늘이 며칠째(dayIndex)인지로 그날 현장만.
  const todaySegments = useMemo(() => {
    const segs: string[] = [];
    const addFromText = (raw: string, dayIndex: number, span: number) => {
      if (!raw || !raw.trim()) return;
      // 지역 키워드: 경상북도(3일차 분할) / 경상남도(전체)
      if (/경상북도|경북/.test(raw)) {
        const day = GB_DAYS[String(dayIndex + 1)];
        segs.push(...(day || Object.values(GB_DAYS).flat()));
        return;
      }
      if (/경상남도|경남/.test(raw)) { segs.push(...GN_STATIONS); return; }
      // "(1,2,3,4)" 등 번호목록 제거
      const cleaned = raw.replace(/\(\s*[\d,\s]+\s*\)/g, ' ');
      // "/"로 나뉜 다일 일정이면 오늘 날짜에 해당하는 그룹만
      const groups = splitDaysBySlash(cleaned);
      const chosen = (span > 1 && groups.length > 1)
        ? (groups[dayIndex] ?? groups[groups.length - 1])
        : groups.join(',');
      chosen.split(',').forEach(seg => { if (seg.trim()) segs.push(seg); });
    };
    for (const e of todayEvents) {
      addFromText(e.text, e.dayIndex, e.span);
      if (e.desc) addFromText(e.desc, e.dayIndex, e.span);
    }
    return segs;
  }, [todayEvents]);

  // 캘린더 매칭 판정용 전체 후보군(관리자는 전체, 일반 사용자는 본인 관리구역)
  const calendarPool = isAdmin && allStationsForCalendar.length ? allStationsForCalendar : stations;
  const isTodayStation = (s: any): boolean => {
    if (!todaySegments.length) return false;
    const cands = [s.name, s.base_name].filter(Boolean);   // 원문 전달(segMatch가 정규화·방향추출)
    if (todaySegments.some(seg => segMatch(seg, cands))) return true;   // 방향까지 정밀 매칭
    // 방향이 달라 실패했어도, 이름으로는 유일하게 이 현장만 해당되면 허용
    // (캘린더의 방향 오표기 대비 — 예: '영천휴게소(익산방향)'인데 DB는 '대구방향')
    return todaySegments.some(seg => {
      if (!nameOnlyMatch(seg, cands)) return false;
      const others = calendarPool.filter((st: any) => st.id !== s.id && nameOnlyMatch(seg, [st.name, st.base_name]));
      return others.length === 0;
    });
  };

  // ── 오늘 작성 완료한 충전소: 목록 맨 아래로 (남은 현장이 위에 오도록) ──
  const [doneTodayNames, setDoneTodayNames] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!stations.length) return;
    (async () => {
      try {
        const sb = createClient();
        const start = new Date(); start.setHours(0, 0, 0, 0);
        const { data } = await sb.from('inspections').select('station_id').gte('created_at', start.toISOString());
        const ids = new Set((data || []).map((r: any) => r.station_id));
        setDoneTodayNames(new Set(stations.filter(s => ids.has(s.id)).map(s => s.name)));
      } catch {}
    })();
  }, [stations]);
  const isDoneToday = (s: any) => doneTodayNames.has(s.name);

  // 오늘 일정 충전소가 캘린더에 적힌 순서(=todaySegments 순서)대로 정렬되도록 인덱스 계산
  const segIndexOf = (s: any): number => {
    const cands = [s.name, s.base_name].filter(Boolean);
    for (let i = 0; i < todaySegments.length; i++) if (segMatch(todaySegments[i], cands)) return i;
    return Infinity;
  };
  // 현재 보기(예: "내 관리구역")에 없더라도, 오늘 캘린더 일정에 매칭되는 다른 회원 소유 현장은
  // 놓치지 않도록 별도로 끌어와 목록에 합친다. (소유자 필터가 캘린더 자동인식을 막지 않도록)
  const extraTodayStations = useMemo(() => {
    if (!isAdmin || !todaySegments.length || !allStationsForCalendar.length) return [];
    const currentIds = new Set(stations.map(s => s.id));
    return allStationsForCalendar.filter(s => !currentIds.has(s.id) && isTodayStation(s));
  }, [isAdmin, stations, allStationsForCalendar, todaySegments]);

  const memberName = (userId: string | null) => members.find(m => m.id === userId)?.name;

  const filtered = useMemo(() => {
    const merged = [...stations, ...extraTodayStations];
    const base = merged
      .filter(s => matchStation(s, query))
      .filter((s, i, arr) => arr.findIndex(x => x.id === s.id) === i);
    // 정렬: 오늘 일정(미작성) 맨 위 → 일반 → 오늘 작성 완료 맨 아래
    const rank = (s: any) => (isDoneToday(s) ? 2 : isTodayStation(s) ? 0 : 1);
    return [...base].sort((a, b) => {
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      if (ra === 0) return segIndexOf(a) - segIndexOf(b);   // 오늘 일정: 캘린더 나열 순서대로
      return 0;
    });
  }, [stations, extraTodayStations, query, todaySegments, doneTodayNames]);

  const updateMeasureSet = (index: number, field: string, value: string) => {
    setMeasureSets(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const addMeasureSet = () => setMeasureSets(prev => [...prev, emptyMeasureSet()]);
  const removeMeasureSet = (index: number) => {
    if (measureSets.length <= 1) return;
    setMeasureSets(prev => prev.filter((_, i) => i !== index));
    thermalApi.removeAt(index);
  };

  const selectFolder = async () => {
    if (!selected) { alert('먼저 충전소를 선택해주세요. 충전소별로 저장 폴더가 기억됩니다.'); return; }
    if (!('showDirectoryPicker' in window)) { alert('이 기능은 데스크톱 Chrome/Edge에서만 작동합니다.'); return; }
    try {
      // @ts-ignore
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setFolderHandle(handle);
      setFolderName(handle.name);
      await saveStationFolder(selected, handle);
      alert(`저장 폴더를 지정했습니다.\n\n충전소: ${selected.name}\n폴더: ${handle.name}\n\n이 충전소는 앞으로 이 폴더에 저장됩니다.`);
    } catch (e: any) {
      if (e.name !== 'AbortError') alert('폴더 선택 실패: ' + e.message);
    }
  };

  const saveToLocal = async (base64: string, fileName: string, subFolderName: string) => {
    if (!folderHandle) return false;
    try {
      const perm = await folderHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        const newPerm = await folderHandle.requestPermission({ mode: 'readwrite' });
        if (newPerm !== 'granted') { alert('폴더 쓰기 권한이 필요합니다.'); return false; }
      }
      let current = folderHandle;
      current = await current.getDirectoryHandle(subFolderName, { create: true });
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
    if (!folderHandle) {
      const proceed = confirm('저장 폴더를 지정하지 않았습니다.\n\n이대로 만들면 PC 폴더에 자동 저장되지 않고 내려받기만 할 수 있습니다.\n\n계속할까요?');
      if (!proceed) return;
    }
    const useThermal = inspType !== '월차' && thermal.some(t => t?.shots.length);
    if (useThermal) {
      const unassigned = thermal.reduce((n, t) => n + (t?.shots.filter(s => !s.part).length || 0), 0);
      if (unassigned && !confirm(`부위를 정하지 않은 열화상 사진이 ${unassigned}장 있습니다.\n그 사진은 빼고 만들까요?`)) return;
      if (thermal.some(t => t?.busy)) return alert('열화상 사진 처리 중입니다. 잠시 후 다시 시도해주세요.');
    }
    setLoading(true);
    try {
      // 별지7: 수배전반별 부위 온도(Point1~3) + 최고온도 대표 사진만 전송
      const b7_panels = useThermal
        ? await thermalApi.buildPanels(measureSets.length)
        : undefined;
      const res = await fetch('/api/inspection/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          station_id: selected.id,
          inspection_type: inspType,
          date,
          inspector_name: inspector,
          count,
          weather,
          measure_sets: measureSets,
          ground_resistance: (inspType === '반기' || inspType === '연차') ? measureSets.map(s => s.ground) : [],
          remarks: remarks,
          b7_panels,
          b7_labels: useThermal ? thermalApi.b7Labels : undefined,   // 현장별 부위 → 엑셀 라벨 교체
          is_mobile: /Android|iPhone|iPad|iPod|Mobile|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        }),
      });
      const r = await res.json();
      if (!res.ok) throw new Error(r.error || `생성 실패 (HTTP ${res.status}${res.status === 413 ? ', 사진 용량 초과' : ''})`);
      // 확정 분류를 계정별 예시로 저장(다음 AI 분류 참고) — 사진을 옮기기 전에 먼저 읽어둠
      if (useThermal) await thermalApi.learn();
      if (folderHandle && r.fileBase64) {
        const dateNum = date.replace(/-/g, '');
        const subFolderName = `${dateNum}_${selected.name}_${inspType}`;
        await saveToLocal(r.fileBase64, r.fileName, subFolderName);
        // 열화상 사진 전부를 같은 점검 폴더(약칭\수배전반번호)에 저장 — '폴더 선택'으로 고른 사진은 이동
        if (useThermal) {
          try {
            const a = await thermalApi.archivePhotos(folderHandle, subFolderName, measureSets.length);
            if (a) setSaveMsg(`${a.failed ? '⚠️' : '✅'} 열화상 사진 ${a.copied}장을 ${a.folder}에 저장했습니다${a.moved ? ` (원본 ${a.moved}장은 옮김)` : ''}${a.failed ? `, ${a.failed}장 실패` : ''}`);
          } catch (e: any) { setSaveMsg('⚠️ 열화상 사진 폴더 저장 실패: ' + e.message); }
        }
      }
      setSavedFile(r.fileName);
      setDownloadUrl(r.downloadUrl);
      setResult({ ...r, station: selected, inspType, date, inspector, count, weather, measureSets, remarks });
      setDoneTodayNames(prev => new Set(prev).add(selected.name));  // 작성 완료 → 목록 맨 아래로 즉시 반영
      setDone(true);
    } catch (e: any) {
      alert('점검표를 만들지 못했습니다.\n' + e.message);
    } finally { setLoading(false); }
  };

  // 저장 결과 안내(열화상 사진 폴더 저장 등)
  const [saveMsg, setSaveMsg] = useState('');

  const sectionTitle: React.CSSProperties = { fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 16 };
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 8, color: 'var(--text-secondary)' };

  if (done) return (
    <>
      <div className="no-print" style={{ maxWidth: 940, margin: 0, padding: 0 }}>
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '32px 28px', textAlign: 'center' }}>
          <CheckCircle2 size={40} color="var(--positive)" strokeWidth={1.8} />
          <h2 style={{ fontSize: 20, margin: '12px 0 10px' }}>점검표를 만들었습니다</h2>
          <div className="ico" style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 14, wordBreak: 'break-all', justifyContent: 'center' }}><FileText size={16} color="var(--text-tertiary)" />{savedFile}</div>
          {folderName && (<div className="ico" style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, justifyContent: 'center', display: 'flex' }}><FolderOpen size={15} color="var(--text-tertiary)" />{folderName}에 저장됨</div>)}
          <div style={{ display: 'grid', gap: 8, maxWidth: 380, margin: '22px auto 0' }}>
            {downloadUrl && (
              <a href={downloadUrl} download={savedFile} className="btn-primary" style={{ textDecoration: 'none' }}><Download size={17} /> 엑셀 내려받기</a>
            )}
            {saveMsg && <Status msg={saveMsg} style={{ fontSize: 13, textAlign: 'left' }} />}
          </div>
          <button onClick={() => { setDone(false); setSelected(null); setQuery(''); setMeasureSets([emptyMeasureSet()]); setRemarks(''); setResult(null); thermalApi.reset(); }} style={{ marginTop: 18, background: 'transparent', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>새 점검 생성</button>
        </div>
      </div>
    </>
  );

  return (
    <div style={{ maxWidth: 940, margin: 0, padding: 0 }}>
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: 8, background: folderHandle ? 'var(--positive-soft)' : 'var(--bg-elevated)', color: folderHandle ? 'var(--positive)' : 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Folder size={18} /></div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>저장 폴더</div>
          <div style={{ fontSize: 13, color: folderName ? 'var(--text-secondary)' : 'var(--warning)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folderName ? (selected ? `${folderName} / ${selected.name}` : folderName) : '지정하지 않음. 생성 후 내려받기만 됩니다.'}</div>
        </div>
        <button onClick={selectFolder} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border-hover)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>{folderHandle ? '변경' : '폴더 선택'}</button>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 22, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <div style={sectionTitle}>충전소 선택</div>
          {isAdmin && (
            <select value={viewOwner} onChange={e => { setViewOwner(e.target.value); setSelected(null); setQuery(''); }}
              style={{ padding: '6px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: `1px solid ${viewOwner === 'mine' ? 'var(--border)' : 'var(--accent)'}`, background: viewOwner === 'mine' ? 'var(--bg-input)' : 'var(--accent-soft)', color: viewOwner === 'mine' ? 'var(--text-secondary)' : 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}>
              <option value="mine">내 관리구역</option>
              {members.map(m => (<option key={m.id} value={m.id}>{m.name} 관리구역</option>))}
              <option value="all">전체 회원</option>
            </select>
          )}
        </div>
        <div style={{ position: 'relative' }}>
          <input className="toss-input" placeholder="충전소 이름으로 검색" value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
          {open && filtered.length > 0 && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50, background: 'var(--bg-card)', border: '1px solid var(--border-hover)', borderRadius: 10, padding: 6, boxShadow: 'var(--shadow-lg)', maxHeight: 320, overflowY: 'auto' }}>
              {filtered.map(s => {
                const doneToday = isDoneToday(s);
                const today = !doneToday && isTodayStation(s);
                const otherOwner = isAdmin && s.user_id && s.user_id !== meId ? memberName(s.user_id) : null;
                return (
                  <button key={s.id} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 7, border: 'none', background: today ? 'var(--positive-soft)' : 'transparent', color: 'var(--text-primary)', cursor: 'pointer', textAlign: 'left', opacity: doneToday ? 0.55 : 1 }} onClick={() => handleSelectStation(s)}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: doneToday ? 'var(--text-tertiary)' : 'var(--positive)', flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {today && <span style={{ marginRight: 6, fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5, background: 'var(--positive-soft)', color: 'var(--positive)' }}>오늘 일정</span>}
                        {doneToday && <span style={{ marginRight: 6, fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5, background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}>오늘 작성함</span>}
                        {otherOwner && <span style={{ marginRight: 6, fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5, background: 'var(--accent-soft)', color: 'var(--accent)' }}>{otherOwner}</span>}
                        {s.name}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>{s.voltage}V, {s.capacity}kW</div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, padding: '2px 8px', borderRadius: 5, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', flexShrink: 0 }}>{s.voltage >= 3000 ? '고압' : '저압'}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
        {selected && (
          <div style={{ marginTop: 12, padding: '14px 16px', background: 'var(--bg-elevated)', borderRadius: 8 }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: 'var(--text-primary)' }}>{selected.name}</div>
            <div style={{ display: 'flex', gap: 24, fontSize: 13, color: 'var(--text-secondary)', flexWrap: 'wrap' }}>
              <div><span style={{ opacity: 0.7 }}>수전전압</span> <strong style={{ color: 'var(--text-primary)', marginLeft: 6 }}>{selected.voltage}V</strong></div>
              <div><span style={{ opacity: 0.7 }}>수전용량</span> <strong style={{ color: 'var(--text-primary)', marginLeft: 6 }}>{selected.capacity}kW</strong></div>
              {selected.panel_count > 1 && (<div><span style={{ opacity: 0.7 }}>수배전반</span> <strong style={{ color: 'var(--text-primary)', marginLeft: 6 }}>{selected.panel_count}개</strong></div>)}
            </div>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 22, marginBottom: 12 }}>
        <div style={sectionTitle}>점검 정보</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 18 }}>
          {TYPE_OPTIONS.map(t => (
            <button key={t.value} onClick={() => setInspType(t.value)} style={{ padding: '12px 4px', borderRadius: 8, border: `1px solid ${inspType === t.value ? 'var(--accent)' : 'var(--border)'}`, background: inspType === t.value ? 'var(--accent-soft)' : 'var(--bg-card)', color: inspType === t.value ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 15, fontWeight: 700, cursor: 'pointer', textAlign: 'center', fontFamily: 'inherit' }}>
              {t.value}
              <div style={{ fontSize: 11, opacity: .7, marginTop: 4, fontWeight: 500 }}>{t.months}</div>
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }} className="info-grid">
          <div><label style={labelStyle}>점검일자</label><input type="date" className="toss-input" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><label style={labelStyle}>점검자</label><input className="toss-input" placeholder="이름" value={inspector} onChange={e => setInspector(e.target.value)} /></div>
          <div><label style={labelStyle}>점검횟수</label><input type="number" className="toss-input" min={1} value={count} onChange={e => setCount(Number(e.target.value))} /></div>
          <div><label style={labelStyle}>날씨(일기)</label>
            <select className="toss-input" value={weather} onChange={e => setWeather(e.target.value)}>
              <option value="자동">자동(실제 날씨)</option>
              <option value="맑음">맑음</option>
              <option value="흐림">흐림</option>
              <option value="우천">우천</option>
            </select>
          </div>
        </div>
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 22, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={sectionTitle}>측정값 입력</div>
          <button onClick={addMeasureSet} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border-hover)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}><Plus size={15} /> 수배전반 추가</button>
        </div>
        {measureSets.map((set, idx) => (
          <div key={idx} style={{ marginBottom: idx < measureSets.length - 1 ? 28 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>수배전반 #{idx + 1}</div>
              {measureSets.length > 1 && (<button onClick={() => removeMeasureSet(idx)} style={{ padding: '4px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}><X size={13} /> 삭제</button>)}
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>전압 (V)</label>
              <div className="measure-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {(['A','B','C','N'] as const).map((phase) => (
                  <div key={phase} style={{ position: 'relative' }}>
                    <input type="number" inputMode="decimal" className="toss-input" placeholder={phase === 'N' ? 'N' : `${phase}상`} style={{ paddingRight: 36 }} value={set[`voltage_${phase}`] ?? ''} onChange={e => updateMeasureSet(idx, `voltage_${phase}`, e.target.value)} />
                    <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-secondary)', pointerEvents: 'none', fontWeight: 600 }}>V</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>전류 (A)</label>
              <div className="measure-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
                {(['A','B','C'] as const).map((phase) => (
                  <div key={phase} style={{ position: 'relative' }}>
                    <input type="number" inputMode="decimal" className="toss-input" placeholder={`${phase}상`} style={{ paddingRight: 36 }} value={set[`current_${phase}`] ?? ''} onChange={e => updateMeasureSet(idx, `current_${phase}`, e.target.value)} />
                    <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-secondary)', pointerEvents: 'none', fontWeight: 600 }}>A</span>
                  </div>
                ))}
                <div />
              </div>
            </div>
            {(inspType === '반기' || inspType === '연차') && (
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>접지저항 (Ω)</label>
                <div style={{ position: 'relative', maxWidth: 220 }}>
                  <input type="number" inputMode="decimal" step="0.01" className="toss-input" placeholder="측정치" style={{ paddingRight: 36 }} value={set.ground ?? ''} onChange={e => updateMeasureSet(idx, 'ground', e.target.value)} />
                  <span style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--text-secondary)', pointerEvents: 'none', fontWeight: 600 }}>Ω</span>
                </div>
              </div>
            )}
            <div>
              <label style={labelStyle}>특이사항 (수배전반 #{idx + 1})</label>
              <input className="toss-input" placeholder="특이사항이 없으면 비워두세요" value={set.remarks ?? ''} onChange={e => updateMeasureSet(idx, 'remarks', e.target.value)} />
            </div>
            {inspType !== '월차' && (
              <ThermalPhotoBox idx={idx} api={thermalApi} />
            )}
            {idx < measureSets.length - 1 && (<div style={{ borderTop: '1px solid var(--border)', marginTop: 20 }} />)}
          </div>
        ))}
      </div>

      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 22, marginBottom: 12 }}>
        <label style={sectionTitle}>종합 의견(별지14)</label>
        <textarea className="toss-input" rows={3} style={{ resize: 'none' }} placeholder="특이사항이 없으면 비워두세요" value={remarks} onChange={e => setRemarks(e.target.value)} />
      </div>

      {selected && (
        <div style={{ padding: '12px 16px', background: 'var(--bg-elevated)', borderRadius: 8, fontSize: 13, marginBottom: 12 }}>
          <div style={{ color: 'var(--text-tertiary)', marginBottom: 2, fontSize: 12 }}>만들어질 파일</div>
          <div style={{ color: 'var(--text-primary)', fontWeight: 600, wordBreak: 'break-all' }}>{selected.name}_{inspType}점검_{date.replace(/-/g, '')}.xlsx</div>
        </div>
      )}

      <button onClick={handleSubmit} disabled={loading} className="btn-primary" style={{ width: '100%', padding: 15, fontSize: 16 }}>{loading ? <><Loader2 size={18} className="spin" /> 점검표 만드는 중</> : '점검표 만들기'}</button>

      <style jsx>{`
        @media (max-width: 768px) {
          .info-grid { grid-template-columns: 1fr !important; }
          .measure-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
      `}</style>
    </div>
  );
}
