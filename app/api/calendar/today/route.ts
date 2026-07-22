import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { gunzipSync, inflateSync, brotliDecompressSync } from 'zlib';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // 항상 최신(캐시 없이) — 오늘 일정 반영
const ICS_KEY = 'calendar_ics_url';

function unfold(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n[ \t]/g, '');
}

function unescapeIcs(s: string): string {
  return s.replace(/\\n/gi, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\').trim();
}

function icsDateToYmd(v: string): string | null {
  const m = v.match(/(\d{4})(\d{2})(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function weekdayIcs(ymd: string): string {
  const map = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  return map[ymdToDate(ymd).getUTCDay()];
}

function todaySeoul(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(new Date());
}

function occursToday(start: string, end: string | null, rrule: string | null, today: string): boolean {
  if (!rrule) {
    if (end) return start <= today && today < end;
    return start === today;
  }
  if (today < start) return false;
  const parts: Record<string, string> = {};
  rrule.split(';').forEach((p) => {
    const [k, val] = p.split('=');
    if (k && val) parts[k.toUpperCase()] = val;
  });
  const freq = parts['FREQ'];
  const until = parts['UNTIL'] ? icsDateToYmd(parts['UNTIL']) : null;
  if (until && today > until) return false;
  const interval = parts['INTERVAL'] ? parseInt(parts['INTERVAL'], 10) : 1;
  if (freq === 'DAILY') {
    const diff = Math.round((ymdToDate(today).getTime() - ymdToDate(start).getTime()) / 86400000);
    return diff >= 0 && diff % interval === 0;
  }
  if (freq === 'WEEKLY') {
    const days = parts['BYDAY'] ? parts['BYDAY'].split(',') : [weekdayIcs(start)];
    return days.includes(weekdayIcs(today));
  }
  if (freq === 'MONTHLY') {
    return start.slice(8) === today.slice(8);
  }
  if (freq === 'YEARLY') {
    return start.slice(5) === today.slice(5);
  }
  return false;
}

export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.get('debug') === '1';
  try {
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
    const { data } = await sb.from('settings').select('value').eq('key', ICS_KEY).maybeSingle();
    const icsUrl = data?.value;
    if (!icsUrl) return NextResponse.json({ titles: [], today: todaySeoul() });

    const res = await fetch(icsUrl, { headers: { 'User-Agent': 'electric-safety-mgmt' }, cache: 'no-store' });
    if (!res.ok) return NextResponse.json({ titles: [], today: todaySeoul(), error: 'ICS fetch failed' });
    // 배포 환경(undici)이 gzip을 자동 해제하지 않는 경우가 있어, 매직바이트로 판별해 직접 해제 후 UTF-8 디코드.
    let bytes = Buffer.from(await res.arrayBuffer());
    const rawByteLen = bytes.length;
    const probe = new URL(req.url).searchParams.get('probe') === '1';
    try {
      if (bytes[0] === 0x1f && bytes[1] === 0x8b) bytes = gunzipSync(bytes);                    // gzip
      else if ((res.headers.get('content-encoding') || '').includes('br')) bytes = brotliDecompressSync(bytes);
      else if (bytes[0] === 0x78 && (bytes[1] === 0x9c || bytes[1] === 0x01 || bytes[1] === 0xda)) bytes = inflateSync(bytes); // zlib/deflate
    } catch { /* 이미 해제된 경우 원본 사용 */ }
    const raw = unfold(new TextDecoder('utf-8').decode(bytes));

    if (probe) {
      const marker = Buffer.from('SUMMARY:');
      const bi = bytes.indexOf(marker);
      const korBytes = bi >= 0 ? Array.from(bytes.slice(bi + 8, bi + 8 + 30)).map(b => b.toString(16).padStart(2, '0')).join(' ') : 'no-summary';
      return NextResponse.json({
        contentEncoding: res.headers.get('content-encoding'),
        rawByteLen, afterLen: bytes.length,
        summaryByteHex: korBytes,
      }, { headers: { 'Cache-Control': 'no-store' } });
    }

    const today = todaySeoul();
    const titles: string[] = [];
    const events: { text: string; desc: string; dayIndex: number; span: number }[] = [];
    const dbg: any[] = [];
    const dayDiff = (a: string, b: string) => Math.round((ymdToDate(b).getTime() - ymdToDate(a).getTime()) / 86400000);

    const blocks = raw.split('BEGIN:VEVENT').slice(1);
    for (const block of blocks) {
      const body = block.split('END:VEVENT')[0];
      const lines = body.split('\n');
      let summary = '';
      let desc = '';
      let start: string | null = null;
      let end: string | null = null;
      let rrule: string | null = null;
      for (const line of lines) {
        if (/^SUMMARY/i.test(line)) summary = unescapeIcs(line.replace(/^SUMMARY[^:]*:/i, ''));
        else if (/^DESCRIPTION/i.test(line)) desc = unescapeIcs(line.replace(/^DESCRIPTION[^:]*:/i, ''));
        else if (/^DTSTART/i.test(line)) start = icsDateToYmd(line.split(':').pop() || '');
        else if (/^DTEND/i.test(line)) end = icsDateToYmd(line.split(':').pop() || '');
        else if (/^RRULE/i.test(line)) rrule = line.replace(/^RRULE[^:]*:/i, '').trim();
      }
      if (!summary || !start) continue;
      const hit = occursToday(start, end, rrule, today);
      if (debug) dbg.push({ summary, start, end, rrule, hit });
      if (hit) {
        // 다일 출장: 오늘이 시작일 기준 며칠째인지(dayIndex), 총 며칠인지(span)
        const dayIndex = rrule ? 0 : Math.max(0, dayDiff(start, today));
        const span = (!rrule && end) ? Math.max(1, dayDiff(start, end)) : 1;
        events.push({ text: summary, desc, dayIndex, span });
        titles.push(summary);
        if (desc) titles.push(desc);   // 일정 설명(메모)란의 현장 목록도 매칭 대상에 포함
      }
    }

    const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };
    if (debug) return NextResponse.json({ titles, events, today, total: blocks.length, dbg }, noStore);
    return NextResponse.json({ titles, events, today }, noStore);
  } catch (e: any) {
    return NextResponse.json({ titles: [], today: todaySeoul(), error: e.message }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
