// ============================================================
// lib/thermal/gtc400c.ts
// BOSCH GTC 400 C 열화상 카메라 사진 해석 (브라우저에서 실행 — 사진 원본을 서버로 올리지 않음)
//  · 한 번 촬영 = RBnnnnnX.JPG(열화상 320×240) + RBnnnnnY.JPG(실화상 640×480)
//  · 온도 원시데이터는 Y 파일의 APP15(0xFFEF) 세그먼트:
//      헤더 32B("GTC_400C") → 160×120 uint16 LE → 트레일러(float32 LE: 0=최저, 4=최고)
//  · °C = raw/100 − 100,  중심점 = 배열 [59:61, 79:81] 2×2 평균 (카메라 화면 십자선 값과 일치)
// ============================================================

// 부위 = 계정별 부위 목록의 이름 (기본 PF/PT/CH — lib/thermal/parts.ts)
export type Part = string;

export interface ThermalShot {
  id: string;          // 'RB01715'
  y: File;             // 실화상(온도 데이터 포함)
  x?: File;            // 열화상
  center: number;
  min: number;
  max: number;
  part: Part | null;   // 확정 부위 (AI 분류 또는 사용자 수정)
  ai?: Part | null;    // AI가 제안한 부위 (수정 여부 판단 → 계정별 학습 예시)
}

const W = 160, H = 120;

function findApp15(buf: ArrayBuffer): DataView | null {
  const v = new DataView(buf);
  if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
  let i = 2;
  while (i + 4 <= v.byteLength && v.getUint8(i) === 0xff) {
    const m = v.getUint8(i + 1);
    if (m === 0xd9 || m === 0xda) break;
    const len = v.getUint16(i + 2);
    if (m === 0xef) return new DataView(buf, i + 4, len - 2);
    i += 2 + len;
  }
  return null;
}

export function parseGtc400c(buf: ArrayBuffer): { center: number; min: number; max: number } | null {
  const seg = findApp15(buf);
  if (!seg || seg.byteLength < 32 + W * H * 2 + 8) return null;
  const head = String.fromCharCode(...new Uint8Array(seg.buffer, seg.byteOffset, 32));
  if (!head.includes('GTC_400C')) return null;
  const px = (r: number, c: number) => seg.getUint16(32 + (r * W + c) * 2, true) / 100 - 100;
  const center = (px(59, 79) + px(59, 80) + px(60, 79) + px(60, 80)) / 4;
  const tail = 32 + W * H * 2;
  const r1 = (n: number) => Math.round(n * 10) / 10;
  return { center: r1(center), min: r1(seg.getFloat32(tail, true)), max: r1(seg.getFloat32(tail + 4, true)) };
}

// 선택한 파일들 → X/Y 짝짓기 + 온도 추출. 온도 데이터가 없는 사진은 제외. 파일명(촬영번호) 순 정렬.
export async function loadShots(files: File[]): Promise<{ shots: ThermalShot[]; skipped: string[] }> {
  const byId = new Map<string, { x?: File; y?: File }>();
  const skipped: string[] = [];
  for (const f of files) {
    const m = f.name.match(/^(.*?)([XY])\.jpe?g$/i);
    if (!m) { skipped.push(f.name); continue; }
    const e = byId.get(m[1]) || {};
    if (m[2].toUpperCase() === 'X') e.x = f; else e.y = f;
    byId.set(m[1], e);
  }
  const shots: ThermalShot[] = [];
  for (const [id, e] of byId) {
    if (!e.y) { if (e.x) skipped.push(e.x.name); continue; }
    const t = parseGtc400c(await e.y.arrayBuffer());
    if (!t) { skipped.push(e.y.name); continue; }
    shots.push({ id, y: e.y, x: e.x, ...t, part: null });
  }
  shots.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  return { shots, skipped };
}

// AI 분류 결과를 "3장 연속 촬영 = 같은 부위" 묶음 다수결로 보정 (사진이 3의 배수일 때만)
export function smoothByTriplets(parts: (Part | null)[]): (Part | null)[] {
  if (parts.length === 0 || parts.length % 3 !== 0) return parts;
  const out = [...parts];
  for (let g = 0; g < parts.length; g += 3) {
    const cnt = new Map<Part, number>();
    for (const p of parts.slice(g, g + 3)) if (p) cnt.set(p, (cnt.get(p) || 0) + 1);
    const best = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best && best[1] >= 2) for (let k = g; k < g + 3; k++) out[k] = best[0];
  }
  return out;
}

// 이미지 축소(분류 요청 용량 절감) → base64(JPEG, data: 접두어 없음)
export async function downscaleToBase64(file: File, maxW = 384, quality = 0.75): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.toDataURL('image/jpeg', quality).split(',')[1];
}

export async function fileToBase64(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

// 별지7 기입 데이터: 부위별 Point1~3 온도(촬영순) + 최고 중심온도 사진(실화상/열화상)
//  키 순서 = 계정 부위 목록 순서 (엑셀 행 라벨과 이름이 안 맞을 때의 기본 행 순서)
export interface B7PartData { temps: number[]; photo_y?: string; photo_x?: string }
export type B7PanelData = Record<string, B7PartData>;

export async function buildB7Payload(shots: ThermalShot[], partNames: string[]): Promise<B7PanelData> {
  const out: B7PanelData = {};
  for (const part of partNames) {
    const list = shots.filter((s) => s.part === part);
    if (!list.length) continue;
    const rep = list.reduce((a, b) => (b.center > a.center ? b : a));
    out[part] = {
      temps: list.slice(0, 3).map((s) => s.center),
      photo_y: await fileToBase64(rep.y),
      photo_x: rep.x ? await fileToBase64(rep.x) : undefined,
    };
  }
  return out;
}
