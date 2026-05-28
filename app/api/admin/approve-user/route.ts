import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// ============================================================
// POST /api/admin/approve-user
// 사용자 승인 또는 거절
// Body: { user_id, action: 'approve' | 'reject', note?, sector_id? }
// ============================================================
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    // 요청자가 관리자인지 확인
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '');
    if (!token) return NextResponse.json({ error: '인증 필요' }, { status: 401 });

    const { data: { user } } = await supabase.auth.getUser(token);
    if (!user) return NextResponse.json({ error: '인증 실패' }, { status: 401 });

    const { data: adminProfile } = await supabase
      .from('profiles').select('role').eq('id', user.id).single();
    if (adminProfile?.role !== 'admin')
      return NextResponse.json({ error: '관리자 권한 필요' }, { status: 403 });

    const { user_id, action, note, sector_id } = await req.json();
    if (!user_id || !action) return NextResponse.json({ error: '파라미터 누락' }, { status: 400 });

    const newStatus = action === 'approve' ? 'approved' : 'rejected';

    // profiles 업데이트
    const profileUpdate: any = {
      status:      newStatus,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    };
    if (sector_id) profileUpdate.sector_id = sector_id;

    await supabase.from('profiles').update(profileUpdate).eq('id', user_id);

    // signup_requests 업데이트
    await supabase.from('signup_requests').update({
      status:       newStatus,
      admin_note:   note || null,
      processed_by: user.id,
      processed_at: new Date().toISOString(),
    }).eq('user_id', user_id);

    // 승인 시 사용자에게 알림 이메일
    const { data: targetProfile } = await supabase
      .from('profiles').select('email, name').eq('id', user_id).single();

    const resendKey = process.env.RESEND_API_KEY;
    const appUrl    = process.env.NEXT_PUBLIC_APP_URL || 'https://electric-safety-mgmt.vercel.app';

    if (resendKey && targetProfile) {
      const subject = action === 'approve'
        ? '[전기안전관리] 계정이 승인되었습니다'
        : '[전기안전관리] 회원가입 신청이 거절되었습니다';

      const text = action === 'approve'
        ? `안녕하세요 ${targetProfile.name}님,\n\n회원가입 신청이 승인되었습니다.\n아래 링크에서 로그인하세요.\n\n${appUrl}/login\n\n─\n전기안전관리 자동화 시스템`
        : `안녕하세요 ${targetProfile.name}님,\n\n회원가입 신청이 거절되었습니다.\n사유: ${note || '관리자 판단'}\n\n문의: rjsdn43666211@gmail.com`;

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${resendKey}`,
        },
        body: JSON.stringify({
          from: 'noreply@electric-safety-mgmt.vercel.app',
          to:   targetProfile.email,
          subject,
          text,
        }),
      });
    }

    return NextResponse.json({ success: true, status: newStatus });
  } catch (e: any) {
    console.error('[approve-user] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
