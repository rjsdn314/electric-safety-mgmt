// ============================================================
// lib/annual/pendingDrawings.ts
// 관리구역에서 충전소를 저장하면서 고른 설계도면 PDF를 도면 화면으로 넘겨주는 임시 보관함
//  · 같은 탭 안의 화면 이동(router.push)에서는 자바스크립트 메모리가 유지되므로 파일을 그대로 넘길 수 있다.
//  · 새로고침하면 사라짐 → 그때는 도면 화면에서 다시 고르면 된다.
// ============================================================
let pending: { stationId: string; files: File[] } | null = null;

export function setPendingDrawings(stationId: string, files: File[]) {
  pending = files.length ? { stationId, files } : null;
}

// 그 충전소 것이면 꺼내고 비운다
export function takePendingDrawings(stationId: string): File[] | null {
  if (!pending || pending.stationId !== stationId) return null;
  const f = pending.files;
  pending = null;
  return f;
}
