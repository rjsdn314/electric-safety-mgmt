'use client';
// 상태 문구 표시: 메시지 앞의 표시(✅ ❌ ⚠️ ⏳ 🕒 📷)를 떼고 아이콘·색으로 보여준다.
//  · 화면 코드에서는 지금처럼 setMsg('✅ 저장되었습니다') 형태로 넘기면 된다.
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Info } from 'lucide-react';

type Kind = 'ok' | 'err' | 'warn' | 'busy' | 'info';

const MARKS: Array<[RegExp, Kind]> = [
  [/^\s*(✅|✓)\s*/, 'ok'],
  [/^\s*(❌|✗)\s*/, 'err'],
  [/^\s*(⚠️|⚠)\s*/, 'warn'],
  [/^\s*(⏳|🕒)\s*/, 'busy'],
  [/^\s*(📷|ℹ️)\s*/, 'info'],
];

export function parseStatus(msg: string): { kind: Kind; text: string } {
  for (const [re, kind] of MARKS) if (re.test(msg)) return { kind, text: msg.replace(re, '') };
  return { kind: 'info', text: msg };
}

// alert/confirm 등 글자만 쓰는 곳용: 앞 표시만 제거
export const plain = (msg: string) => parseStatus(msg).text;

export function Status({ msg, kind: forced, style }: { msg: string; kind?: Kind; style?: React.CSSProperties }) {
  if (!msg) return null;
  const p = parseStatus(msg);
  const kind = forced || p.kind;
  const Icon = kind === 'ok' ? CheckCircle2 : kind === 'err' ? XCircle : kind === 'warn' ? AlertTriangle : kind === 'busy' ? Loader2 : Info;
  const cls = kind === 'busy' ? 'info' : kind;
  return (
    <div className={`status ${cls}`} style={style}>
      <Icon size={16} className={kind === 'busy' ? 'spin' : undefined} />
      <span style={{ whiteSpace: 'pre-line' }}>{p.text}</span>
    </div>
  );
}
