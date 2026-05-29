import { NextResponse } from 'next/server';

// GET /api/stations/debug-cols  -> env + service-role check (no secret leak)
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  let serviceRole = 'n/a';
  try {
    const payload = JSON.parse(Buffer.from(serviceKey.split('.')[1] || '', 'base64').toString());
    serviceRole = payload.role || 'n/a';
  } catch (e) { serviceRole = 'decode_fail'; }

  let anonRole = 'n/a';
  try {
    const payload = JSON.parse(Buffer.from(anonKey.split('.')[1] || '', 'base64').toString());
    anonRole = payload.role || 'n/a';
  } catch (e) { anonRole = 'decode_fail'; }

  return NextResponse.json({
    hasUrl: !!url,
    serviceKeyLen: serviceKey.length,
    anonKeyLen: anonKey.length,
    serviceRole,
    anonRole,
    sameKey: serviceKey === anonKey,
  });
}
