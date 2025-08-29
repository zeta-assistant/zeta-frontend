// app/api/admin/set-plan/route.ts
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  const adminKey = req.headers.get('x-admin-key');
  if (adminKey !== process.env.ADMIN_API_KEY) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { userId, plan }: { userId: string; plan: 'free' | 'premium' } = await req.json();
  if (!userId || !['free','premium'].includes(plan)) {
    return NextResponse.json({ ok:false, error:'Bad input' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    app_metadata: { plan },
  });

  if (error) return NextResponse.json({ ok:false, error: error.message }, { status: 400 });
  return NextResponse.json({ ok:true, user: data.user });
}
