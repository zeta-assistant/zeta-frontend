import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';

export async function POST(req: Request) {
  const cookieStore = cookies();
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore });

  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) {
    return NextResponse.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }
  const userId = session.user.id;

  const body = await req.json();
  let { username, self_description, profile_image_url } = body || {};
  username = (username || '').toLowerCase().trim();

  // Validate username
  if (!/^[a-z0-9_]{2,15}$/.test(username)) {
    return NextResponse.json({ ok: false, error: 'Invalid username. Use 2–15 chars: a–z, 0–9, _' }, { status: 400 });
  }

  // Upsert into user_profiles (unique on lower(username))
  const upsert = {
    user_id: userId,
    username,
    self_description: self_description || null,
    profile_image_url: profile_image_url || null,
    updated_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from('user_profiles')
    .upsert(upsert, { onConflict: 'user_id' });

  if (upErr) {
    // 23505 = unique violation
    if ((upErr as any).code === '23505') {
      return NextResponse.json({ ok: false, error: 'Username is already taken.' }, { status: 409 });
    }
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 400 });
  }

  // Mirror to auth.user_metadata for convenience
  const { error: authErr } = await supabase.auth.updateUser({
    data: { user_name: username, self_description, profile_image_url },
  });
  if (authErr) {
    return NextResponse.json({ ok: false, error: authErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
