'use client';
import { createBrowserClient } from '@supabase/ssr';

// 여러 탭을 동시에 열어두는 사용 패턴에서, Supabase 기본 인증 락(Web Locks API)이
// 걸린 채 안 풀려 토큰 자동 갱신이 멈추고 결국 세션이 조용히 만료되는 문제가 있었다
// (stations/upload 페이지에 개별 우회 코드가 있었음). 락을 no-op으로 바꿔 전역 해결.
const noopLock = async <R,>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> => fn();

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { lock: noopLock } }
  );
}
