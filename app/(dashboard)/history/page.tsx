'use client';
import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useThermalPanels, ThermalPhotoBox } from '@/components/inspection/ThermalPhotos';
import { Thermometer, Download, HardDriveDownload, Trash2, X, Save, Loader2, Smartphone, FileCheck2 } from 'lucide-react';

// 열화상 기능 도입일 — 이전에 생성된 점검은 '열화상 대기' 표시를 하지 않음
const THERMAL_SINCE = '2026-09-15';

const TYPES = ['전체', '월차', '분기', '반기', '연차'];

export default function HistoryPage() {
    const [items, setItems] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState('전체');
    const [filterInspector, setFilterInspector] = useState('전체');
    const [inspectors, setInspectors] = useState<string[]>([]);
    const [search, setSearch] = useState('');
    const [syncing, setSyncing] = useState(false);
    const [syncProgress, setSyncProgress] = useState('');
    const [savingId, setSavingId] = useState<string | null>(null);
    const [isDesktop, setIsDesktop] = useState(false);
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [bulkDeleting, setBulkDeleting] = useState(false);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [meId, setMeId] = useState<string | null>(null);
    const [members, setMembers] = useState<{ id: string; name: string }[]>([]);
    const [viewOwner, setViewOwner] = useState<string>('mine'); // 'mine' | 회원id | 'all'
    const PAGE_SIZE = 50;
    // 별지7 열화상 나중에 추가 (현장에선 사진 없이 생성 → 노트북에서 반영)
    const [thermalItem, setThermalItem] = useState<any>(null);
    // 필증 대체(정기검사·사용전검사를 받은 개소)
    const [certItem, setCertItem] = useState<any>(null);
    const [certKind, setCertKind] = useState<'정기검사' | '사용전검사'>('정기검사');   // 대체는 정기검사만 허용
    const [certDate, setCertDate] = useState('');
    const [certFile, setCertFile] = useState<File | null>(null);
    const [certBusy, setCertBusy] = useState(false);
    const [thermalSaving, setThermalSaving] = useState(false);
    const thermalApi = useThermalPanels();
    useEffect(() => { setIsDesktop('showDirectoryPicker' in window); }, []);

  // 권한·회원 목록 (관리자: 사이트 보유 다른 회원)
  useEffect(() => {
        (async () => {
                const sb = createClient();
                const { data: { user } } = await sb.auth.getUser();
                if (!user) return;
                setMeId(user.id);
                const { data: prof } = await sb.from('profiles').select('role').eq('id', user.id).single();
                const admin = prof?.role === 'admin';
                setIsAdmin(admin);
                if (admin) {
                          const { data: owners } = await sb.from('stations').select('user_id').not('user_id', 'is', null);
                          const ownerIds = [...new Set((owners || []).map((o: any) => o.user_id))].filter(id => id !== user.id);
                          if (ownerIds.length) {
                                    const { data: profs } = await sb.from('profiles').select('id, name').in('id', ownerIds);
                                    setMembers((profs || []).map((p: any) => ({ id: p.id, name: p.name || '이름없음' })));
                          }
                }
        })();
  }, []);

  // 보기 대상 충전소 id 목록(소유자 스코프). null = 제약 없음(전체)
  const ownerStationIds = async (sb: any): Promise<string[] | null> => {
        let target: string | null = null;
        if (!isAdmin) target = meId;
        else if (viewOwner === 'mine') target = meId;
        else if (viewOwner !== 'all') target = viewOwner;
        if (!target) return null; // 'all'
        const { data } = await sb.from('stations').select('id').eq('user_id', target);
        return (data || []).map((s: any) => s.id);
  };

  // reset=true: 필터/검색 변경 → 처음부터. reset=false: '더보기' → 다음 페이지 누적.
  const loadData = async (reset: boolean, offsetOverride?: number) => {
        if (reset) setLoading(true); else setLoadingMore(true);
        const sb = createClient();
        const offset = reset ? 0 : (offsetOverride ?? 0);

        // 소유자 스코프(내 관리구역/회원별/전체)
        const ownerIds = await ownerStationIds(sb);

        // 충전소명 검색 → 매칭되는 station_id (전체 이력 대상)
        let searchIds: string[] | null = null;
        const term = search.trim();
        if (term) {
                const like = `%${term}%`;
                const [r1, r2] = await Promise.all([
                  sb.from('stations').select('id').ilike('name', like),
                  sb.from('stations').select('id').ilike('base_name', like),
                ]);
                searchIds = [...new Set([...(r1.data || []), ...(r2.data || [])].map((s: any) => s.id))];
        }

        // 소유자 스코프 ∩ 검색 결과
        let stationIdFilter: string[] | null = null;
        if (ownerIds && searchIds) stationIdFilter = ownerIds.filter(id => searchIds!.includes(id));
        else stationIdFilter = ownerIds ?? searchIds;
        if (stationIdFilter && stationIdFilter.length === 0) {
                setItems([]); setHasMore(false); setSelectedIds(new Set());
                setLoading(false); setLoadingMore(false); return;
        }

        let q = sb.from('inspections')
          .select('*')
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);
        if (filterType !== '전체') q = q.eq('inspection_type', filterType);
        if (filterInspector !== '전체') q = q.eq('inspector_name', filterInspector);
        if (stationIdFilter) q = q.in('station_id', stationIdFilter);
        const { data: insps, error } = await q;
        if (error) { console.error('점검 조회 오류:', error); setLoading(false); setLoadingMore(false); return; }

        let merged: any[] = [];
        if (insps && insps.length > 0) {
                const stationIds = [...new Set(insps.map(i => i.station_id))];
                const { data: stations } = await sb
                  .from('stations')
                  .select('id, base_name, name, voltage, capacity, panel_count')
                  .in('id', stationIds);
                const stationMap = new Map(stations?.map(s => [s.id, s]) || []);
                merged = insps.map(i => ({ ...i, station: stationMap.get(i.station_id) }));
        }
        setItems(prev => reset ? merged : [...prev, ...merged]);
        setHasMore((insps?.length || 0) === PAGE_SIZE);
        if (reset) setSelectedIds(new Set());
        setLoading(false); setLoadingMore(false);
  };

  // 필터/검색/보기대상 변경 → 처음부터 다시 로드 (검색은 300ms 디바운스)
  useEffect(() => {
        if (!meId) return; // 권한 확인 전엔 대기
        const t = setTimeout(() => loadData(true), search ? 300 : 0);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterType, filterInspector, search, viewOwner, meId, isAdmin]);

  // 점검자 목록(중복 제거) — 드롭다운 채우기용
  useEffect(() => {
        (async () => {
                const sb = createClient();
                const { data } = await sb.from('inspections').select('inspector_name').limit(2000);
                const names = [...new Set((data || []).map((r: any) => (r.inspector_name || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ko'));
                setInspectors(names);
        })();
  }, []);

  const removeStorageFile = async (sb: any, item: any) => {
        if (!item.file_path) return;
        try {
                const url = new URL(item.file_path);
                const pathMatch = url.pathname.match(/\/inspections\/(.+)$/);
                if (pathMatch) await sb.storage.from('inspections').remove([pathMatch[1]]);
        } catch (e) { console.error('스토리지 삭제 실패:', e); }
  };

  const handleDelete = async (item: any) => {
        if (!confirm(`정말 삭제하시겠습니까?\n\n${item.file_name}\n\n이 작업은 되돌릴 수 없습니다.`)) return;
        const sb = createClient();
        await removeStorageFile(sb, item);
        const { error } = await sb.from('inspections').delete().eq('id', item.id);
        if (error) { alert('삭제 실패: ' + error.message); return; }
        alert('삭제되었습니다');
        loadData(true);
  };

  // ── 일괄 삭제 (선택 항목의 서버 기록 + 파일 모두 삭제) ──
  const toggleSelect = (id: string) => {
        setSelectedIds(prev => {
                const next = new Set(prev);
                if (next.has(id)) next.delete(id); else next.add(id);
                return next;
        });
  };
    const toggleSelectAll = (ids: string[]) => {
          setSelectedIds(prev => {
                  const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
                  return allSelected ? new Set() : new Set(ids);
          });
    };
    const handleBulkDelete = async () => {
          const ids = Array.from(selectedIds);
          if (ids.length === 0) return;
          if (!confirm(`선택한 ${ids.length}건을 삭제하시겠습니까?\n\n서버 기록과 저장된 파일이 모두 삭제되며, 이 작업은 되돌릴 수 없습니다.`)) return;
          setBulkDeleting(true);
          try {
                  const sb = createClient();
                  const targets = items.filter(i => selectedIds.has(i.id));
                  for (const item of targets) { await removeStorageFile(sb, item); }
                  const { error } = await sb.from('inspections').delete().in('id', ids);
                  if (error) { alert('일괄 삭제 실패: ' + error.message); return; }
                  alert(`${ids.length}건이 삭제되었습니다.`);
                  loadData(true);
          } finally { setBulkDeleting(false); }
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

  const handleSync = async () => {
        if (!('showDirectoryPicker' in window)) { alert('이 기능은 데스크톱 Chrome/Edge에서만 작동합니다.'); return; }
        if (items.length === 0) { alert('동기화할 점검 이력이 없습니다.'); return; }
        try {
                setSyncing(true);
                setSyncProgress('폴더 선택 중...');
                // @ts-ignore
          const folderHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
                let successCount = 0; let failCount = 0;
                for (let i = 0; i < items.length; i++) {
                          const item = items[i];
                          setSyncProgress(`${i + 1}/${items.length}: ${item.file_name}`);
                          try {
                                      const res = await fetch(item.file_path);
                                      if (!res.ok) throw new Error('다운로드 실패');
                                      const blob = await res.blob();
                                      const arrayBuffer = await blob.arrayBuffer();
                                      const date = item.inspection_date;
                                      const [yyyy, mm] = date.split('-');
                                      const periodFolder = `${yyyy}${mm}${item.inspection_type}점검`;
                                      const baseName = item.station?.base_name || item.station?.name || 'unknown';
                                      const isKintex = baseName.includes('KINTEX') || baseName.includes('킨텍스');
                                      const isHighV = (item.station?.voltage || 0) >= 3000;
                                      let current = folderHandle;
                                      if (isKintex) {
                                                    current = await findOrCreateDir(current, baseName);
                                                    current = await current.getDirectoryHandle(isHighV ? '고압' : '저압', { create: true });
                                                    current = await current.getDirectoryHandle(periodFolder, { create: true });
                                      } else {
                                                    current = await findOrCreateDir(current, baseName);
                                                    current = await current.getDirectoryHandle(periodFolder, { create: true });
                                      }
                                      const dateNum = date.replace(/-/g, '');
                                      const fileName = `${item.station?.name || baseName}_${item.inspection_type}점검_${dateNum}.xlsx`;
                                      const fileHandle = await current.getFileHandle(fileName, { create: true });
                                      const writable = await fileHandle.createWritable();
                                      await writable.write(arrayBuffer);
                                      await writable.close();
                                      successCount++;
                          } catch (e: any) { console.error(`동기화 실패: ${item.file_name}`, e); failCount++; }
                }
                setSyncProgress('');
                alert(`PC 폴더 동기화를 마쳤습니다.\n\n성공 ${successCount}개, 실패 ${failCount}개`);
        } catch (e: any) {
                if (e.name !== 'AbortError') alert('동기화 오류: ' + e.message);
        } finally { setSyncing(false); setSyncProgress(''); }
  };

  const openFolderDB = (): Promise<IDBDatabase> => new Promise((resolve, reject) => {
        const req = indexedDB.open('inspection-app', 1);
        req.onupgradeneeded = () => { req.result.createObjectStore('folders'); };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
  });

  const folderKeyByName = (item: any) => {
        const base = (item?.station?.name || item?.station?.base_name || '').trim();
        return 'folderByName_' + base;
  };

  const getStationFolder = async (item: any): Promise<any> => {
        try {
                const db = await openFolderDB();
                const getOne = (key: string) => new Promise<any>((res) => {
                          const tx = db.transaction('folders', 'readonly');
                          const r = tx.objectStore('folders').get(key);
                          r.onsuccess = () => res(r.result || null);
                          r.onerror = () => res(null);
                });
                let result = await getOne(folderKeyByName(item));
                if (!result && item?.station_id) result = await getOne('folder_' + item.station_id);
                return result;
        } catch (e) { return null; }
  };

  const saveStationFolder = async (item: any, handle: any) => {
        try {
                const db = await openFolderDB();
                const tx = db.transaction('folders', 'readwrite');
                const store = tx.objectStore('folders');
                store.put(handle, folderKeyByName(item));
                if (item?.station_id) store.put(handle, 'folder_' + item.station_id);
        } catch (e) {}
  };

  const saveOneToPc = async (item: any) => {
        if (!('showDirectoryPicker' in window)) { alert('이 기능은 데스크톱 Chrome/Edge에서만 작동합니다.'); return; }
        if (!item.file_path) { alert('저장된 파일을 찾을 수 없습니다.'); return; }
        try {
                setSavingId(item.id);
                let handle = await getStationFolder(item);
                if (handle) {
                          const perm = await handle.queryPermission({ mode: 'readwrite' });
                          if (perm !== 'granted' && perm !== 'prompt') handle = null;
                }
                if (!handle) {
                          // @ts-ignore
                  handle = await window.showDirectoryPicker({ mode: 'readwrite' });
                          await saveStationFolder(item, handle);
                }
                let perm = await handle.queryPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                          perm = await handle.requestPermission({ mode: 'readwrite' });
                          if (perm !== 'granted') { alert('폴더 쓰기 권한이 필요합니다.'); return; }
                }
                const res = await fetch(item.file_path);
                if (!res.ok) throw new Error('파일 다운로드 실패');
                const arrayBuffer = await (await res.blob()).arrayBuffer();
                const dateNum = item.inspection_date.replace(/-/g, '');
                const stName = item.station?.name || item.station?.base_name || 'unknown';
                const subFolderName = `${dateNum}_${stName}_${item.inspection_type}`;
                const sub = await handle.getDirectoryHandle(subFolderName, { create: true });
                const fileName = item.file_name || `${stName}_${item.inspection_type}점검_${dateNum}.xlsx`;
                const fileHandle = await sub.getFileHandle(fileName, { create: true });
                const writable = await fileHandle.createWritable();
                await writable.write(arrayBuffer);
                await writable.close();
                const sb = createClient();
                const newMv = { ...(item.measure_values || {}), saved_to_pc: true };
                await sb.from('inspections').update({ measure_values: newMv }).eq('id', item.id);
                setItems(prev => prev.map(it => it.id === item.id ? { ...it, measure_values: newMv } : it));
                alert(`PC에 저장했습니다.\n\n${subFolderName} / ${fileName}`);
        } catch (e: any) {
                if (e.name !== 'AbortError') alert('PC 저장 실패: ' + e.message);
        } finally { setSavingId(null); }
  };

  const deleteLocalFile = async (item: any) => {
        if (!('showDirectoryPicker' in window)) { alert('이 기능은 데스크톱 Chrome/Edge에서만 작동합니다.'); return; }
        if (!confirm(`해당 로컬 파일을 삭제하시겠습니까?\n\n${item.file_name}\n\n(점검이력은 그대로 유지되며, PC에 저장된 엑셀 파일만 삭제됩니다.)`)) return;
        try {
                setSavingId(item.id);
                const handle = await getStationFolder(item);
                if (!handle) { alert('이 충전소의 저장 폴더 기록이 없어 로컬 파일 위치를 찾을 수 없습니다.\n점검 생성/저장 시 지정한 폴더가 있어야 삭제할 수 있습니다.'); return; }
                const perm = await handle.queryPermission({ mode: 'readwrite' });
                if (perm !== 'granted') {
                          const np = await handle.requestPermission({ mode: 'readwrite' });
                          if (np !== 'granted') { alert('폴더 접근 권한이 필요합니다.'); return; }
                }
                const dateNum = (item.inspection_date || '').replace(/-/g, '');
                const stName = item.station?.name || item.station?.base_name || 'unknown';
                const subFolderName = `${dateNum}_${stName}_${item.inspection_type}`;
                const fileName = item.file_name || `${stName}_${item.inspection_type}점검_${dateNum}.xlsx`;
                let removed = false;
                try {
                          const sub = await handle.getDirectoryHandle(subFolderName);
                          await sub.removeEntry(fileName);
                          removed = true;
                          try { let empty = true; for await (const _e of (sub as any).values()) { empty = false; break; } if (empty) await handle.removeEntry(subFolderName); } catch {}
                } catch (e) {
                          try { await handle.removeEntry(fileName); removed = true; } catch {}
                }
                const sb = createClient();
                const newMv = { ...(item.measure_values || {}), local_deleted: true, saved_to_pc: false };
                await sb.from('inspections').update({ measure_values: newMv }).eq('id', item.id);
                setItems(prev => prev.map(it => it.id === item.id ? { ...it, measure_values: newMv } : it));
                alert(removed ? `PC의 파일을 삭제했습니다.\n\n${fileName}` : `PC에서 파일을 찾지 못했습니다. 이미 지워졌을 수 있어 "파일 없음"으로 표시합니다.`);
        } catch (e: any) {
                if (e.name !== 'AbortError') alert('로컬 파일 삭제 실패: ' + e.message);
        } finally { setSavingId(null); }
  };

    // ── 필증 대체 ──
    const openCert = (item: any) => {
      const c = item.measure_values?.certificate;
      setCertKind('정기검사'); setCertDate(c?.date || ''); setCertFile(null); setCertItem(item);
    };
    // 사진 필증은 서버 한도(약 4.5MB) 안으로 줄여서 보냄
    const shrinkImage = (f: File) => new Promise<File>((resolve) => {
      if (!f.type.startsWith('image/') || f.size < 2.5 * 1024 * 1024) return resolve(f);
      const img = new Image(); const url = URL.createObjectURL(f);
      img.onload = () => {
        const k = Math.min(1, 2400 / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
        c.toBlob((b) => { URL.revokeObjectURL(url); resolve(b ? new File([b], f.name.replace(/\.\w+$/, '.jpg'), { type: 'image/jpeg' }) : f); }, 'image/jpeg', 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(f); };
      img.src = url;
    });
    const submitCert = async () => {
      const item = certItem; if (!item) return;
      if (!certDate) { alert('정기검사일을 넣어 주세요.'); return; }
      if (!certFile) { alert('필증 파일을 골라 주세요.'); return; }
      const file = await shrinkImage(certFile);
      if (file.size > 4.3 * 1024 * 1024) { alert('필증 파일이 너무 큽니다 (4MB 이하). PDF를 줄이거나 사진으로 올려 주세요.'); return; }
      setCertBusy(true);
      try {
        const fd = new FormData();
        fd.append('inspection_id', item.id); fd.append('kind', certKind); fd.append('date', certDate); fd.append('file', file);
        const res = await fetch('/api/inspection/certificate', { method: 'POST', body: fd });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(r.error || `HTTP ${res.status}`);
        const updated = { ...item, file_path: r.downloadUrl, measure_values: r.measure_values };
        setItems(prev => prev.map(it => it.id === item.id ? updated : it));
        if (isDesktop) {
          await saveOneToPc(updated);   // 문구가 들어간 엑셀로 PC 파일 교체
          // 필증 파일도 같은 점검 폴더에 저장
          try {
            const handle = await getStationFolder(updated);
            if (handle && (await handle.queryPermission({ mode: 'readwrite' })) === 'granted') {
              const dateNum = (updated.inspection_date || '').replace(/-/g, '');
              const stName = updated.station?.name || updated.station?.base_name || 'unknown';
              const sub = await handle.getDirectoryHandle(`${dateNum}_${stName}_${updated.inspection_type}`, { create: true });
              const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || 'pdf').toLowerCase();
              const fh = await sub.getFileHandle(`필증_${certKind}_${certDate.replace(/-/g, '')}.${ext}`, { create: true });
              const w = await fh.createWritable(); await w.write(file); await w.close();
            }
          } catch { /* 필증 PC 저장은 실패해도 서버에는 보관됨 */ }
        } else {
          alert('필증 대체를 반영했습니다. 목록의 내려받기 버튼으로 새 파일을 받을 수 있습니다.');
        }
        setCertItem(null);
      } catch (e: any) { alert('필증 대체를 반영하지 못했습니다.\n' + e.message); }
      finally { setCertBusy(false); }
    };

    // ── 열화상 추가 ──
    const thermalPanelCount = (item: any) =>
      Math.max(1, item?.measure_values?.sets?.length || 0, item?.station?.panel_count || 0);
    const openThermal = (item: any) => {
      // 저압: 촬영 순서 규칙 + 현장별 부위 설정 불러오기
      thermalApi.setStationContext({ stationId: item?.station_id || null, lowVoltage: item?.station?.voltage != null && Number(item.station.voltage) < 3000 });
      thermalApi.reset(); setThermalItem(item);
    };
    const closeThermal = () => { if (thermalSaving) return; thermalApi.reset(); setThermalItem(null); };
    const submitThermal = async () => {
      const item = thermalItem; if (!item) return;
      if (!thermalApi.hasAny) { alert('열화상 사진을 먼저 선택해주세요.'); return; }
      if (thermalApi.busy) { alert('열화상 사진 처리 중입니다. 잠시 후 다시 시도해주세요.'); return; }
      if (thermalApi.unassigned && !confirm(`부위를 정하지 않은 사진이 ${thermalApi.unassigned}장 있습니다.\n그 사진은 빼고 반영할까요?`)) return;
      if (item.measure_values?.thermal && !confirm('이미 열화상이 반영된 점검표입니다.\n기존 별지7 온도·사진을 새 사진으로 교체할까요?')) return;
      setThermalSaving(true);
      try {
        const b7_panels = await thermalApi.buildPanels(thermalPanelCount(item));
        const res = await fetch('/api/inspection/thermal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inspection_id: item.id, b7_panels, b7_labels: thermalApi.b7Labels }) });
        const r = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(r.error || `HTTP ${res.status}${res.status === 413 ? ', 사진 용량 초과' : ''}`);
        const updated = { ...item, file_path: r.downloadUrl, measure_values: r.measure_values };
        setItems(prev => prev.map(it => it.id === item.id ? updated : it));
        await thermalApi.learn();   // 확정 분류를 계정별 예시로 저장 — 사진을 옮기기 전에 먼저 읽어둠
        if (isDesktop) {
          alert(`열화상을 반영했습니다 (별지7 ${r.applied}장).\n\n이어서 PC 폴더의 엑셀 파일도 새 파일로 저장합니다.`);
          await saveOneToPc(updated);
          // 열화상 사진 전부를 같은 점검 폴더(약칭\수배전반번호)에 저장 — '폴더 선택'으로 고른 사진은 이동
          const handle = await getStationFolder(updated);
          if (handle && thermalApi.hasAny) {
            const dateNum = (updated.inspection_date || '').replace(/-/g, '');
            const stName = updated.station?.name || updated.station?.base_name || 'unknown';
            try {
              const a = await thermalApi.archivePhotos(handle, `${dateNum}_${stName}_${updated.inspection_type}`, thermalPanelCount(updated));
              if (a) alert(`열화상 사진 ${a.copied}장을 ${a.folder}에 저장했습니다.${a.moved ? `\n원본 ${a.moved}장은 옮겼습니다.` : ''}${a.failed ? `\n${a.failed}장은 저장하지 못했습니다.` : ''}`);
            } catch (e: any) { alert('열화상 사진을 폴더에 저장하지 못했습니다.\n' + e.message); }
          }
          thermalApi.reset(); setThermalItem(null);
        } else {
          alert(`열화상을 반영했습니다 (별지7 ${r.applied}장).\n\n목록의 내려받기 버튼으로 새 파일을 받을 수 있습니다.`);
          thermalApi.reset(); setThermalItem(null);
        }
      } catch (e: any) {
        alert('열화상 반영 실패: ' + e.message);
      } finally { setThermalSaving(false); }
    };

    // 검색·필터는 서버에서 처리하므로 items가 곧 표시 목록
    const visibleItems = items;
    const visibleIds = visibleItems.map(i => i.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  return (
        <div className="page-pad" style={{padding: '28px 32px 60px'}}>
          {certItem && (
            <div onClick={() => !certBusy && setCertItem(null)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '60px 16px' }}>
              <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'var(--bg-card)', borderRadius: 12, padding: 24, boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>정기검사 필증으로 대체</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{certItem.station?.name}, {certItem.inspection_type}점검, {certItem.inspection_date}</div>
                  </div>
                  <button onClick={() => setCertItem(null)} disabled={certBusy} aria-label="닫기" style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '12px 0 16px', lineHeight: 1.6 }}>
                  정기검사를 받아 열화상·접지 측정을 하지 않은 점검입니다. 점검표는 그대로 두고 별지7, 접지저항, 종합의견에 "정기검사 필증으로 대체" 문구를 넣고 필증 파일을 함께 보관합니다.
                </div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>정기검사일</label>
                <input type="date" className="toss-input" value={certDate} onChange={e => setCertDate(e.target.value)} style={{ marginBottom: 14 }} />
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>정기검사 필증 <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(PDF 또는 사진)</span></label>
                <input type="file" accept="application/pdf,.pdf,image/*" onChange={e => setCertFile(e.target.files?.[0] || null)} style={{ marginBottom: 6, fontSize: 13 }} />
                {certItem.measure_values?.certificate && (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 6 }}>이미 반영됨: {certItem.measure_values.certificate.kind}, {certItem.measure_values.certificate.date} (<a href={certItem.measure_values.certificate.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>필증 보기</a>). 다시 반영하면 바뀝니다.</div>
                )}
                <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                  <button onClick={() => setCertItem(null)} disabled={certBusy} style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>취소</button>
                  <button onClick={submitCert} disabled={certBusy || !certDate || !certFile} className="btn-primary" style={{ flex: 2, padding: 12, fontSize: 14 }}>{certBusy ? <><Loader2 size={16} className="spin" /> 반영하는 중</> : '점검표에 반영'}</button>
                </div>
              </div>
            </div>
          )}
          {thermalItem && (
            <div onClick={closeThermal} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: '40px 16px' }}>
              <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 900, background: 'var(--bg-card)', borderRadius: 12, padding: 24, boxShadow: 'var(--shadow-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>열화상 추가</div>
                    <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4 }}>{thermalItem.station?.name}, {thermalItem.inspection_type}점검, {thermalItem.inspection_date}</div>
                  </div>
                  <button onClick={closeThermal} disabled={thermalSaving} style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', cursor: 'pointer', lineHeight: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} aria-label="닫기"><X size={16} /></button>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', marginTop: 10 }}>
                  수배전반마다 사진을 고르면 별지7에 온도, 판정, 사진을 채웁니다. <a href="/guide" style={{ color: 'var(--accent)' }}>사용 방법</a>
                </div>
                {Array.from({ length: thermalPanelCount(thermalItem) }, (_, idx) => (
                  <div key={idx} style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>수배전반 #{idx + 1}</div>
                    <ThermalPhotoBox idx={idx} api={thermalApi} />
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
                  <button onClick={closeThermal} disabled={thermalSaving} style={{ flex: 1, padding: 12, borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>취소</button>
                  <button onClick={submitThermal} disabled={thermalSaving || thermalApi.busy || !thermalApi.hasAny} className="btn-primary" style={{ flex: 2, padding: 12, fontSize: 14 }}>{thermalSaving ? <><Loader2 size={16} className="spin" /> 점검표에 반영하는 중</> : '점검표에 반영'}</button>
                </div>
              </div>
            </div>
          )}
                <div style={{display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24, gap: 16, flexWrap: 'wrap'}}>
                          <div>
                                    <h1 style={{margin: '0 0 4px'}}>점검 이력</h1>
                                    <p style={{margin: 0, fontSize: 14, color: 'var(--text-secondary)'}}>만든 점검표 파일 목록입니다.</p>
                          </div>
                  {isDesktop && (<button onClick={handleSync} disabled={syncing}
                                             style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border-hover)', background: 'var(--bg-card)', color: 'var(--text-primary)', fontSize: 13, fontWeight: 600, cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.6 : 1, whiteSpace: 'nowrap' }}>
                    {syncing ? <><Loader2 size={15} className="spin" /> {syncProgress || '동기화 중'}</> : <><HardDriveDownload size={15} /> PC 폴더로 모두 저장</>}
                  </button>)}
                </div>
        
              <div style={{display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap'}}>
                {isAdmin && (
                  <select value={viewOwner} onChange={e => setViewOwner(e.target.value)}
                    style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 700, border: `1px solid ${viewOwner === 'mine' ? 'var(--border)' : 'var(--accent)'}`, background: viewOwner === 'mine' ? 'var(--bg-elevated)' : 'var(--accent-soft)', color: viewOwner === 'mine' ? 'var(--text-secondary)' : 'var(--accent)', cursor: 'pointer', fontFamily: 'inherit', marginRight: 4 }}>
                          <option value="mine">내 관리구역</option>
                          {members.map(m => (<option key={m.id} value={m.id}>{m.name} 관리구역</option>))}
                          <option value="all">전체 회원</option>
                  </select>
                )}
                {TYPES.map(t => (
                    <button key={t} onClick={() => setFilterType(t)}
                                  style={{ padding: '8px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${filterType === t ? 'var(--accent)' : 'var(--border)'}`, background: filterType === t ? 'var(--accent-soft)' : 'transparent', color: filterType === t ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit' }}>{t}</button>
                  ))}
                      <select value={filterInspector} onChange={e => setFilterInspector(e.target.value)}
                                  style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: `1px solid ${filterInspector !== '전체' ? 'var(--accent)' : 'var(--border)'}`, background: filterInspector !== '전체' ? 'var(--accent-soft)' : 'var(--bg-elevated)', color: filterInspector !== '전체' ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontFamily: 'inherit', marginLeft: 'auto' }}>
                                <option value="전체">점검자 전체</option>
                                {inspectors.map(n => (<option key={n} value={n}>{n}</option>))}
                      </select>
                      <input className="toss-input" placeholder="충전소 검색" value={search} onChange={e => setSearch(e.target.value)} style={{flex: 1, minWidth: 160}}/>
              </div>
        
          {selectedIds.size > 0 && (
                  <div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, padding: '12px 16px', borderRadius: 12, background: 'var(--negative-soft)', border: '1px solid rgba(201,54,54,0.25)'}}>
                            <div style={{fontSize: 13, fontWeight: 600, color: 'var(--negative)'}}>{selectedIds.size}건 선택됨</div>
                            <div style={{display: 'flex', gap: 8}}>
                                        <button onClick={() => setSelectedIds(new Set())} style={{padding: '8px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'}}>선택 해제</button>
                                        <button onClick={handleBulkDelete} disabled={bulkDeleting} style={{padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--negative)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: bulkDeleting ? 'wait' : 'pointer', opacity: bulkDeleting ? 0.6 : 1, display: 'inline-flex', alignItems: 'center', gap: 6}}>{bulkDeleting ? '삭제 중' : <><Trash2 size={14} /> {selectedIds.size}건 삭제</>}</button>
                            </div>
                  </div>
              )}
        
              <div className="toss-card" style={{padding: 0, overflow: 'hidden'}}>
                      <div style={{display: 'grid', gridTemplateColumns: '36px 2fr 0.8fr 1fr 0.8fr 2fr 256px', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', background: 'var(--bg-elevated)', alignItems: 'center'}}>
                                <div style={{textAlign: 'center'}}><input type="checkbox" checked={allVisibleSelected} onChange={() => toggleSelectAll(visibleIds)} style={{cursor: 'pointer', width: 16, height: 16}}/></div>
                                <div>충전소</div><div>종류</div><div>점검일</div><div>점검자</div><div>파일</div><div></div>
                      </div>
              
                {loading ? (
                    <div style={{padding: 40, textAlign: 'center', color: 'var(--text-tertiary)'}}>불러오는 중</div>
                  ) : visibleItems.length === 0 ? (
                    <div style={{padding: 40, textAlign: 'center', color: 'var(--text-tertiary)'}}>점검 기록이 없습니다.</div>
                  ) : (
                    visibleItems.map((item, _i, _a) => (<div key={'g'+item.id}>{(_i === 0 || (_a[_i-1].created_at||'').slice(0,7) !== (item.created_at||'').slice(0,7)) && (<div style={{padding:'8px 20px',fontWeight:600,fontSize:12,color:'var(--text-tertiary)',borderBottom:'1px solid var(--border)'}}>{(item.created_at||'').slice(0,4)}년 {Number((item.created_at||'').slice(5,7))}월에 만듦</div>)}
                                <div key={item.id} style={{display: 'grid', gridTemplateColumns: '36px 2fr 0.8fr 1fr 0.8fr 2fr 256px', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, alignItems: 'center', background: selectedIds.has(item.id) ? 'var(--accent-soft)' : 'transparent'}}>
                                              <div style={{textAlign: 'center'}}><input type="checkbox" checked={selectedIds.has(item.id)} onChange={() => toggleSelect(item.id)} style={{cursor: 'pointer', width: 16, height: 16}}/></div>
                                              <div style={{fontWeight: 600}}>
                                                {item.station?.name || '-'}
                                                {item.measure_values?.device === 'mobile' && (
                                        <span style={{marginLeft: 6, fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', gap: 3, verticalAlign: 'middle'}}><Smartphone size={11} />휴대폰</span>
                                                              )}
                                                {item.measure_values?.device === 'mobile' && !item.measure_values?.saved_to_pc && (
                                        <span style={{marginLeft: 4, fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5, background: 'var(--warning-soft)', color: 'var(--warning)'}}>PC 저장 전</span>
                                                              )}
                                              </div>
                                              <div><span style={{padding: '2px 8px', borderRadius: 5, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600}}>{item.inspection_type}</span></div>
                                              <div>{item.inspection_date}</div>
                                              <div>{item.inspector_name}</div>
                                              <div style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12, color: 'var(--text-secondary)'}}>
                                                {item.file_name}
                                                {item.measure_values?.certificate && (
                                        <a href={item.measure_values.certificate.url} target="_blank" rel="noopener noreferrer" title={`${item.measure_values.certificate.kind} ${item.measure_values.certificate.date} 필증 보기`} style={{marginLeft: 6, fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5, background: 'var(--positive-soft)', color: 'var(--positive)', textDecoration: 'none'}}>{item.measure_values.certificate.kind} 필증</a>
                                                              )}
                                                {item.inspection_type !== '월차' && !item.measure_values?.thermal && !item.measure_values?.certificate && (item.created_at || '') >= THERMAL_SINCE && (
                                        <span style={{marginLeft: 6, fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5, background: 'var(--warning-soft)', color: 'var(--warning)'}}>열화상 없음</span>
                                                              )}
                                                {item.measure_values?.local_deleted && (
                                        <span style={{marginLeft: 6, fontSize: 11, fontWeight: 600, padding: '1px 6px', borderRadius: 5, background: 'var(--bg-elevated)', color: 'var(--text-tertiary)'}}>PC 파일 없음</span>
                                                              )}
                                              </div>
                                              <div style={{display: 'flex', gap: 6, justifyContent: 'flex-end', alignItems: 'center'}}>
                                                {item.measure_values?.device === 'mobile' && !item.measure_values?.saved_to_pc && (
                                        <button onClick={() => saveOneToPc(item)} disabled={savingId === item.id} title="PC 폴더에 저장" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 9px', borderRadius: 7, background: 'var(--accent)', color: '#fff', border: 'none', cursor: savingId === item.id ? 'wait' : 'pointer', fontSize: 12, fontWeight: 600, lineHeight: 1, whiteSpace: 'nowrap' }}>{savingId === item.id ? <Loader2 size={13} className="spin" /> : <><Save size={13} />PC 저장</>}</button>
                                                              )}
                                                {item.inspection_type !== '월차' && item.file_path && (
                                        <button onClick={() => openThermal(item)} title={item.measure_values?.thermal ? '열화상 사진 교체' : '열화상 사진 추가 (별지7)'} style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'var(--bg-card)', color: item.measure_values?.thermal || item.measure_values?.certificate ? 'var(--text-secondary)' : 'var(--warning)', border: `1px solid ${item.measure_values?.thermal || item.measure_values?.certificate ? 'var(--border)' : 'rgba(183,121,31,0.45)'}`, cursor: 'pointer', lineHeight: 0 }}><Thermometer size={15} /></button>
                                                              )}
                                                {item.inspection_type !== '월차' && item.file_path && (
                                        <button onClick={() => openCert(item)} title={item.measure_values?.certificate ? '필증 대체 고치기' : '정기검사 필증으로 대체'} style={{ width: 30, height: 30, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'var(--bg-card)', color: item.measure_values?.certificate ? 'var(--positive)' : 'var(--text-secondary)', border: '1px solid var(--border)', cursor: 'pointer', lineHeight: 0 }}><FileCheck2 size={15} /></button>
                                                              )}
                                                {item.file_path && (
                                        <a href={item.file_path} download={item.file_name} title="엑셀 내려받기" style={{ width: 30, height: 30, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, border: '1px solid var(--border)', color: 'var(--accent)', textDecoration: 'none', lineHeight: 0 }}><Download size={15} /></a>
                                                              )}
                                                {/* 로컬 파일 삭제: PC의 엑셀 파일만 */}
                                                {isDesktop && (
                                                  item.measure_values?.local_deleted ? (
                                                    <span title="로컬 파일 없음" style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', lineHeight: 0, color: 'var(--text-tertiary)', opacity: .4, cursor: 'default' }}><Trash2 size={15} /></span>
                                                  ) : (
                                        <button onClick={() => deleteLocalFile(item)} disabled={savingId === item.id} title="PC에 저장된 엑셀 파일만 삭제 (이력은 남음)" style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'var(--bg-card)', color: 'var(--text-secondary)', border: '1px solid var(--border)', cursor: savingId === item.id ? 'wait' : 'pointer', lineHeight: 0 }}><Trash2 size={15} /></button>
                                                  )
                                                )}
                                                {/* 점검이력 삭제 */}
                                                              <button onClick={() => handleDelete(item)} title="점검 기록 삭제 (서버 기록과 파일 모두)" aria-label="점검 기록 삭제" style={{ width: 30, height: 30, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'var(--bg-card)', color: 'var(--negative)', border: '1px solid rgba(201,54,54,0.3)', cursor: 'pointer', lineHeight: 0 }}><X size={15} /></button>
                                              </div>
                                </div>
                    </div> ))
                  )}
              </div>
          {!loading && hasMore && (
                  <button onClick={() => loadData(false, items.length)} disabled={loadingMore} style={{ width: '100%', marginTop: 12, padding: '12px 0', fontSize: 13, fontWeight: 600, borderRadius: 8, border: '1px solid var(--border)', cursor: loadingMore ? 'wait' : 'pointer', background: 'var(--bg-card)', color: 'var(--text-secondary)' }}>{loadingMore ? '불러오는 중' : '더 보기'}</button>
              )}
        </div>
      );
}
