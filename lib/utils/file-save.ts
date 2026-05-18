// ============================================================
// lib/utils/file-save.ts
// File System Access API — Chrome 전용
// 폴더 구조: {충전소명}/{연도}/{월}/{점검유형}점검/{파일명}.xlsx
// ============================================================

export interface FolderStructure {
  stationName: string;   // 예: "의성휴게소 청주방향"
  year: string;          // 예: "2026"
  month: string;         // 예: "05"
  inspectionType: string; // 예: "월차"
}

/**
 * File System Access API 지원 여부 확인
 */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window;
}

/**
 * Base64 → Uint8Array 변환
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * 폴더 경로 단계별 생성 또는 열기
 * FileSystemDirectoryHandle을 재귀적으로 생성
 */
async function getOrCreateFolder(
  root: FileSystemDirectoryHandle,
  parts: string[]
): Promise<FileSystemDirectoryHandle> {
  let current = root;
  for (const part of parts) {
    // 폴더명에 사용 불가 문자 제거
    const safeName = part.replace(/[\\/:*?"<>|]/g, '_');
    current = await current.getDirectoryHandle(safeName, { create: true });
  }
  return current;
}

/**
 * 메인 저장 함수
 * @param base64 엑셀 파일 Base64
 * @param fileName 저장할 파일명
 * @param folder 폴더 구조 정보
 * @param rootHandle 루트 디렉토리 핸들 (사용자가 선택한 폴더)
 */
export async function saveExcelToFolder(
  base64: string,
  fileName: string,
  folder: FolderStructure,
  rootHandle: FileSystemDirectoryHandle
): Promise<string> {
  // 폴더 구조: {충전소명}/{연도}/{월}/{점검유형}점검/
  const folderParts = [
    folder.stationName,
    folder.year,
    folder.month,
    `${folder.inspectionType}점검`,
  ];

  // 폴더 생성 (없으면 자동 생성)
  const targetFolder = await getOrCreateFolder(rootHandle, folderParts);

  // 파일 생성 및 쓰기
  const fileHandle = await targetFolder.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  const bytes = base64ToUint8Array(base64);
  await writable.write(bytes);
  await writable.close();

  // 저장된 전체 경로 반환 (표시용)
  return `${folderParts.join('/')}/${fileName}`;
}

/**
 * 루트 폴더 선택 다이얼로그
 * 첫 실행 시 한 번만 선택하면 됨
 * — localStorage에 직전 선택 폴더 정보 저장 (재선택 최소화)
 */
export async function pickRootFolder(): Promise<FileSystemDirectoryHandle> {
  const handle = await (window as any).showDirectoryPicker({
    mode: 'readwrite',
    startIn: 'desktop',
  });
  return handle;
}

/**
 * 폴더 권한 재확인 (페이지 새로고침 후)
 */
export async function verifyPermission(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const opts = { mode: 'readwrite' as FileSystemPermissionMode };
  if ((await (handle as any).queryPermission(opts)) === 'granted') return true;
  if ((await (handle as any).requestPermission(opts)) === 'granted') return true;
  return false;
}

// ── 폴백: File System Access API 미지원 시 일반 다운로드 ─────
export function downloadFallback(base64: string, fileName: string) {
  const bytes = base64ToUint8Array(base64);
  const blob = new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
