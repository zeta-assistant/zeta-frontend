import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
  const headerStore = await headers();
  const authHeader = headerStore.get('Authorization');
  if (!authHeader) return NextResponse.json({ error: 'No auth token' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { id, pinned, actioned, content, category } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof pinned === 'boolean') updates.pinned = pinned;
  if (typeof actioned === 'boolean') updates.actioned = actioned;
  if (typeof content === 'string') updates.content = content;
  if (typeof category === 'string') updates.category = category;

  const { error } = await supabase.from('thoughts').update(updates).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}