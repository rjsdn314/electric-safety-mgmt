// ============================================================
// lib/thermal/archive.ts
// 열화상 사진을 점검 폴더에 저장 (브라우저 File System Access API)
//  · 위치: 현장 폴더\YYYYMMDD_현장_종류\약칭\[수배전반번호]   (수배전반 1개면 번호 폴더 없음)
//    약칭은 같은 현장의 이전 점검 폴더에서 쓰던 이름(예: 문막, 킨텍스저압, 공항), 없으면 '열화상'
//  · '폴더 선택'으로 고른 사진(source 있음)은 복사 크기 확인 후 원본 삭제 = 이동
//  · 같은 이름·크기 파일이 이미 있으면 다시 쓰지 않음 (재반영, 저장 위치에서 바로 고른 경우 안전)
// ============================================================

export type SourceEntry = { name: string; dir: any };   // any = FileSystemDirectoryHandle
export interface ArchivePanel { index: number; files: File[]; source?: SourceEntry[] | null }
export interface ArchiveResult { copied: number; moved: number; failed: number; folder: string }

const isThermalJpg = (n: string) => /[XY]\.jpe?g$/i.test(n);

export async function findPhotoFolderName(root: any, exclude: string): Promise<string> {
  const dirs: string[] = [];
  for await (const [name, h] of root.entries()) if (h.kind === 'directory' && /^\d{8}_/.test(name) && name !== exclude) dirs.push(name);
  dirs.sort().reverse();
  for (const d of dirs.slice(0, 8)) {
    const dh = await root.getDirectoryHandle(d);
    for await (const [name, h] of dh.entries()) {
      if (h.kind !== 'directory') continue;
      for await (const [n2, h2] of h.entries()) {
        if (h2.kind === 'file' && isThermalJpg(n2)) return name;
        if (h2.kind === 'directory' && /^\d+$/.test(n2)) {
          for await (const [n3, h3] of h2.entries()) if (h3.kind === 'file' && isThermalJpg(n3)) return name;
        }
      }
    }
  }
  return '열화상';
}

export async function archivePanelPhotos(root: any, subFolderName: string, panels: ArchivePanel[], panelCount: number): Promise<ArchiveResult | null> {
  const withFiles = panels.filter((p) => p.files?.length);
  if (!withFiles.length) return null;
  if ((await root.queryPermission({ mode: 'readwrite' })) !== 'granted'
    && (await root.requestPermission({ mode: 'readwrite' })) !== 'granted') throw new Error('폴더 쓰기 권한이 필요합니다');
  const sub = await root.getDirectoryHandle(subFolderName, { create: true });
  const nick = await findPhotoFolderName(root, subFolderName);
  const base = await sub.getDirectoryHandle(nick, { create: true });
  let copied = 0, moved = 0, failed = 0;
  for (const p of withFiles) {
    const dest = panelCount > 1 ? await base.getDirectoryHandle(String(p.index + 1), { create: true }) : base;
    for (const f of p.files) {
      try {
        const src = p.source?.find((s) => s.name === f.name);
        const sameDir = src ? await src.dir.isSameEntry(dest) : false;
        let exists = false;
        try { exists = (await (await dest.getFileHandle(f.name)).getFile()).size === f.size; } catch { /* 없음 */ }
        if (!exists && !sameDir) {
          const fh = await dest.getFileHandle(f.name, { create: true });
          const w = await fh.createWritable();
          await w.write(f);
          await w.close();
          if ((await fh.getFile()).size !== f.size) throw new Error('복사 크기 불일치');
        }
        copied++;
        if (src && !sameDir) { await src.dir.removeEntry(f.name); moved++; }
      } catch { failed++; }
    }
  }
  return { copied, moved, failed, folder: `${subFolderName}\\${nick}` };
}
