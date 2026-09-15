// ============================================================
// lib/thermal/localClassify.ts
// 무료 부위 분류 (AI 키/크레딧 없이 브라우저에서 실행)
//  · MobileNet(이미지 특징 추출)으로 사진을 벡터로 바꾸고,
//    내 계정에 저장된 예시 사진(직접 고르거나 확정한 분류)과 가장 비슷한 부위를 고른다.
//  · 모델 파일(MobileNet v2, 약 14MB)은 사이트 public/models 에 두고 처음 한 번 받아 브라우저에 캐시된다.
//    (tfhub → Kaggle 리다이렉트에 의존하지 않도록 자체 호스팅)
//  · 예시가 없는 부위는 추천할 수 없다 → 직접 골라 반영하면 다음부터 쌓인다.
// ============================================================
import type { Part } from './gtc400c';

type Example = { part: string; image: string };

const SIZE = 224;
let modelPromise: Promise<any> | null = null;
const exampleEmbeddings = new Map<string, Float32Array>();
let examplesCache: { at: number; list: Example[] } | null = null;

function loadModel(): Promise<any> {
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import('@tensorflow/tfjs');
      await tf.ready();
      const mobilenet = await import('@tensorflow-models/mobilenet');
      // tfhub 원본(mobilenet_v2_100_224/classification/2)과 동일 파일, 입력 범위 [0,1]
      return mobilenet.load({ version: 2, alpha: 1.0, modelUrl: '/models/mobilenet_v2_100/model.json', inputRange: [0, 1] });
    })().catch((e) => { modelPromise = null; throw e; });
  }
  return modelPromise;
}

function toCanvas(src: CanvasImageSource): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  c.getContext('2d')!.drawImage(src, 0, 0, SIZE, SIZE);
  return c;
}

async function embed(model: any, canvas: HTMLCanvasElement): Promise<Float32Array> {
  const t = model.infer(canvas, true);          // true = 분류 결과 대신 특징 벡터
  const d = (await t.data()) as Float32Array;
  t.dispose();
  let n = 0;
  for (let i = 0; i < d.length; i++) n += d[i] * d[i];
  n = Math.sqrt(n) || 1;
  return d.map((v) => v / n);
}

const cosine = (a: Float32Array, b: Float32Array) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

async function b64ToCanvas(b64: string) {
  const img = new Image();
  img.src = 'data:image/jpeg;base64,' + b64;
  await img.decode();
  return toCanvas(img);
}

async function fileToCanvas(f: File) {
  const bmp = await createImageBitmap(f);
  const c = toCanvas(bmp);
  bmp.close();
  return c;
}

async function getExamples(): Promise<Example[]> {
  if (examplesCache && Date.now() - examplesCache.at < 60_000) return examplesCache.list;
  const r = await fetch('/api/thermal/examples', { cache: 'no-store' });
  if (!r.ok) throw new Error('내 예시 사진을 불러오지 못했습니다');
  const j = await r.json();
  examplesCache = { at: Date.now(), list: j.examples || [] };
  return examplesCache.list;
}

// 예시가 새로 저장되면 다음 분류에서 다시 불러오도록
export function invalidateExamples() { examplesCache = null; }

export async function classifyLocally(files: File[], partNames: string[]): Promise<{ parts: (Part | null)[]; examplesUsed: number; missing: string[] }> {
  const examples = (await getExamples()).filter((e) => partNames.includes(e.part));
  const missing = partNames.filter((n) => !examples.some((e) => e.part === n));
  if (!examples.length) return { parts: files.map(() => null), examplesUsed: 0, missing };

  const model = await loadModel();
  const exVecs: { part: string; v: Float32Array }[] = [];
  for (const e of examples) {
    const key = `${e.part}:${e.image.length}:${e.image.slice(-48)}`;
    let v = exampleEmbeddings.get(key);
    if (!v) { v = await embed(model, await b64ToCanvas(e.image)); exampleEmbeddings.set(key, v); }
    exVecs.push({ part: e.part, v });
  }

  const parts: (Part | null)[] = [];
  for (const f of files) {
    const v = await embed(model, await fileToCanvas(f));
    const sims = new Map<string, number[]>();
    for (const e of exVecs) sims.set(e.part, [...(sims.get(e.part) || []), cosine(v, e.v)]);
    // 부위별 가장 비슷한 예시 최대 3장의 평균 유사도가 가장 높은 부위
    let best: string | null = null, bestScore = -Infinity;
    for (const [p, list] of sims) {
      const top = list.sort((a, b) => b - a).slice(0, 3);
      const score = top.reduce((a, b) => a + b, 0) / top.length;
      if (score > bestScore) { bestScore = score; best = p; }
    }
    parts.push(best);
  }
  return { parts, examplesUsed: examples.length, missing };
}
