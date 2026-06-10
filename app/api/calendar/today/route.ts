import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
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

function todaySeoul(): string {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
    return fmt.format(new Date());
  }

export async function GET() {
    try {
          const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
          const { data } = await sb.from('settings').select('value').eq('key', ICS_KEY).maybeSingle();
          const icsUrl = data?.value || '';
          if (!icsUrl) return NextResponse.json({ titles: [], today: todaySeoul() });

          const res = await fetch(icsUrl, { headers: { 'User-Agent': 'electric-safety-mgmt/1.0' }, next: { revalidate: 300 } });
          if (!res.ok) return NextResponse.json({ titles: [], today: todaySeoul(), error: 'ICS 다운로드 실패' });
          const raw = unfold(await res.text());

          const today = todaySeoul();
          const titles: string[] = [];

          const blocks = raw.split('BEGIN:VEVENT').slice(1);
          for (const block of blocks) {
                  const body = block.split('END:VEVENT')[0];
                  const lines = body.split('\n');
                  let summary = '';
                  let start: string | null = null;
                  let end: string | null = null;
                  for (const line of lines) {
                            if (/^SUMMARY/i.test(line)) summary = unescapeIcs(line.replace(/^SUMMARY[^:]*:/i, ''));
                            else if (/^DTSTART/i.test(line)) start = icsDateToYmd(line.split(':').pop() || '');
                            else if (/^DTEND/i.test(line)) end = icsDateToYmd(line.split(':').pop() || '');
                          }
                  if (!summary || !start) continue;
                  const inRange = end ? (today >= start && today < end) : (today === start);
                  if (inRange) titles.push(summary);
                }

          return NextResponse.json({ titles, today });
        } catch (e: any) {
          return NextResponse.json({ titles: [], today: todaySeoul(), error: e.message });
        }
  }
