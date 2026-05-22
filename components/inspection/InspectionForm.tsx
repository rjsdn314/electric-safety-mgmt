// 폴더명 정규화 함수 (공백/괄호/하이픈/언더스코어/점 제거)
  const normalize = (s: string) => s.replace(/[\s()\-_.]/g, '').toLowerCase();

  // 기존 폴더 중에서 정규화 매칭되는 폴더 찾기
  const findOrCreateDir = async (parent: any, targetName: string) => {
    const normTarget = normalize(targetName);
    // 기존 폴더 탐색
    for await (const entry of parent.values()) {
      if (entry.kind === 'directory' && normalize(entry.name).includes(normTarget)) {
        return await parent.getDirectoryHandle(entry.name);
      }
    }
    // 없으면 새로 생성
    return await parent.getDirectoryHandle(targetName, { create: true });
  };

  const saveToLocal = async (base64: string, folderInfo: any, fileName: string) => {
    if (!folderHandle) return false;
    try {
      // 년월 폴더명: 202605월차점검 (공백 없이)
      const yyyy = folderInfo.year.replace('년', '');
      const mm = folderInfo.month.replace('월', '');
      const periodFolder = `${yyyy}${mm}${folderInfo.inspection_type}`;

      // 충전소 폴더 → 년월 폴더
      let current = folderHandle;
      
      if (folderInfo.is_kintex) {
        // 킨텍스: 충전소/고압or저압/년월폴더
        current = await findOrCreateDir(current, folderInfo.base_name);
        current = await findOrCreateDir(current, folderInfo.voltage_type);
        current = await current.getDirectoryHandle(periodFolder, { create: true });
      } else {
        // 일반: 충전소/년월폴더
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