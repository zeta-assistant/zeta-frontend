import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export async function GET(req: Request) {
  try {
    // 1) read bearer from client (ThoughtsPanel sends it)
    const h = await headers();
    const authHeader = h.get('Authorization');
    if (!authHeader) {
      return NextResponse.json({ error: 'No auth token' }, { status: 401 });
    }

    // 2) parse projectId
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'projectId required' }, { status: 400 });
    }

    // 3) supabase with user context
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: authHeader } } }
    );

    // (optional) echo who we are under RLS
    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr) console.error('auth.getUser error:', userErr);
    // console.log('RLS user:', userData?.user?.id);

    // 4) query thoughts
    const { data, error } = await supabase
      .from('thoughts')
      .select('*')
      .eq('project_id', projectId)
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      console.error('thoughts list error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ thoughts: data ?? [] });
  } catch (e: any) {
    console.error('list route crashed:', e);
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}