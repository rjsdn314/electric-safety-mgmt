import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

    // 비압축(identity)으로 요청하고 바이트를 직접 UTF-8로 디코드한다.
    // (배포 환경에서 res.text()가 gzip/charset 처리를 잘못해 한글이 깨지는 문제 방지)
    const res = await fetch(icsUrl, {
      headers: { 'User-Agent': 'electric-safety-mgmt', 'Accept-Encoding': 'identity' },
      cache: 'no-store',
    });
    if (!res.ok) return NextResponse.json({ titles: [], today: todaySeoul(), error: 'ICS fetch failed' });
    const raw = unfold(new TextDecoder('utf-8').decode(await res.arrayBuffer()));

    const today = todaySeoul();
    const titles: string[] = [];
    const dbg: any[] = [];

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
        titles.push(summary);
        if (desc) titles.push(desc);   // 일정 설명(메모)란의 현장 목록도 매칭 대상에 포함
      }
    }

    const noStore = { headers: { 'Cache-Control': 'no-store, max-age=0' } };
    if (debug) return NextResponse.json({ titles, today, total: blocks.length, events: dbg }, noStore);
    return NextResponse.json({ titles, today }, noStore);
  } catch (e: any) {
    return NextResponse.json({ titles: [], today: todaySeoul(), error: e.message }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  }
}
