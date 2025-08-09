import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const abort = new AbortController();
  const t = setTimeout(() => abort.abort(), 30_000); // 30s hard timeout

  try {
    const { project_id, trigger = 'manual', limit_messages = 20 } = await req.json();
    if (!project_id) return NextResponse.json({ error: 'project_id required' }, { status: 400 });

    const url = 'https://inprydzukperccgtxgvx.supabase.co/functions/v1/generate-thought';
    const upstream = await fetch(url, {
      method: 'POST',
      signal: abort.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
      },
      body: JSON.stringify({ project_id, trigger, limit_messages }),
    });

    const ct = upstream.headers.get('content-type') || '';
    const payload = ct.includes('application/json')
      ? await upstream.json().catch(() => ({}))
      : await upstream.text().catch(() => '');

    if (!upstream.ok) {
      console.error('Edge function error', { status: upstream.status, payload });
      return NextResponse.json(
        { error: typeof payload === 'object' ? (payload as any)?.error ?? payload : payload || `HTTP ${upstream.status}` },
        { status: upstream.status }
      );
    }

    return NextResponse.json(typeof payload === 'object' ? payload : { ok: true, message: payload });
  } catch (e: any) {
    const msg = e?.name === 'AbortError' ? 'Timed out calling edge function' : (e?.message || String(e));
    console.error('Proxy crashed:', msg);
    return NextResponse.json({ error: msg }, { status: 504 });
  } finally {
    clearTimeout(t);
  }
}