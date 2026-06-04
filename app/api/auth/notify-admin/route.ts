import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// POST /api/auth/notify-admin
// 회원가입 신청 시 관리자에게 이메일 알림 발송
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const { user_id, name, email, company, phone, message } = await req.json();

    const adminEmail = process.env.ADMIN_EMAIL || 'rjsdn43666211@gmail.com';
    const appUrl     = process.env.NEXT_PUBLIC_APP_URL || 'https://electric-safety-mgmt.vercel.app';

    // Supabase Service Role 클라이언트
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 가입 신청 기록을 서버(서비스 롤)에서 확실히 남긴다 (RLS/세션 의존 제거)
    if (user_id) {
      const { data: existing } = await supabase
        .from('signup_requests').select('id').eq('user_id', user_id).maybeSingle();
      if (!existing) {
        await supabase.from('signup_requests').insert({
          user_id, email, name,
          company: company || null,
          phone:   phone   || null,
          message: message || null,
          status:  'pending',
        });
      }
    }

    // Supabase 이메일 발송 (Edge Function 또는 SMTP 미설정 시 콘솔 로그)
    // 실제 운영 시 Resend / SendGrid API로 교체 권장
    const emailBody = `
새로운 회원가입 신청이 접수되었습니다.

이름    : ${name}
이메일  : ${email}
소속    : ${company || '미입력'}
연락처  : ${phone   || '미입력'}
신청사유: ${message || '미입력'}

승인/거절 링크:
${appUrl}/admin/users

─────────────────────────────
전기안전관리 직무고시 자동화 시스템
`;

    // Supabase admin.listUsers 로 user_id 조회 후 메타데이터 확인 (로깅 목적)
    console.log('[notify-admin]', { name, email, company });

    // 실제 이메일 발송: RESEND_API_KEY 환경변수가 있으면 발송
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || 'onboarding@resend.dev',
          to:   adminEmail,
          subject: `[전기안전관리] 새 회원가입 신청 — ${name} (${email})`,
          text: emailBody,
        }),
      });
    }

    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[notify-admin] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
