'use client';
// ============================================================
// hooks/useFileSystem.ts
// File System Access API 폴더 선택 및 저장 훅
// 첫 실행 시 한 번만 폴더 선택 → 이후 자동 저장
// ============================================================
import { useState, useCallback, useRef } from 'react';
import {
  isFileSystemAccessSupported,
  pickRootFolder,
  verifyPermission,
  saveExcelToFolder,
  downloadFallback,
  FolderStructure,
} from '@/lib/utils/file-save';

export type SaveStatus = 'idle' | 'picking' | 'saving' | 'done' | 'error';

export function useFileSystem() {
  const rootHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  const [rootFolderName, setRootFolderName] = useState<string>('');
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [lastSavedPath, setLastSavedPath] = useState<string>('');
  const [error, setError] = useState<string>('');

  const isSupported = isFileSystemAccessSupported();

  /**
   * 루트 폴더 선택 (처음 1회 또는 변경 시)
   */
  const selectRootFolder = useCallback(async () => {
    if (!isSupported) return;
    try {
      setStatus('picking');
      const handle = await pickRootFolder();
      rootHandleRef.current = handle;
      setRootFolderName(handle.name);
      setStatus('idle');
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError('폴더 선택 실패: ' + e.message);
        setStatus('error');
      } else {
        setStatus('idle');
      }
    }
  }, [isSupported]);

  /**
   * 엑셀 저장
   * - File System Access 지원 → 폴더 구조 자동 생성 후 저장
   * - 미지원 → 일반 다운로드
   */
  const saveExcel = useCallback(async (
    base64: string,
    fileName: string,
    folder: FolderStructure
  ): Promise<boolean> => {
    setStatus('saving');
    setError('');

    try {
      if (!isSupported) {
        // Chrome 아닌 브라우저: 일반 다운로드
        downloadFallback(base64, fileName);
        setStatus('done');
        setLastSavedPath(fileName);
        return true;
      }

      // 루트 폴더 미선택 시 먼저 선택
      if (!rootHandleRef.current) {
        setStatus('picking');
        const handle = await pickRootFolder();
        rootHandleRef.current = handle;
        setRootFolderName(handle.name);
      }

      // 권한 재확인
      const ok = await verifyPermission(rootHandleRef.current!);
      if (!ok) {
        // 권한 거부 → 폴더 재선택
        const handle = await pickRootFolder();
        rootHandleRef.current = handle;
        setRootFolderName(handle.name);
      }

      setStatus('saving');
      const savedPath = await saveExcelToFolder(
        base64, fileName, folder, rootHandleRef.current!
      );

      setLastSavedPath(`${rootHandleRef.current!.name}/${savedPath}`);
      setStatus('done');
      return true;

    } catch (e: any) {
      console.error('저장 실패:', e);
      // 실패 시 폴백 다운로드
      downloadFallback(base64, fileName);
      setError('폴더 저장 실패 — 일반 다운로드로 전환됨');
      setStatus('error');
      return false;
    }
  }, [isSupported]);

  return {
    isSupported,
    rootFolderName,
    status,
    lastSavedPath,
    error,
    selectRootFolder,
    saveExcel,
  };
}
