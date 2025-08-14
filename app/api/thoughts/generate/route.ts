import { NextResponse } from 'next/server';

// Ensure this is a server (not edge) and never statically optimized
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FUNCTION_URL =
  'https://inprydzukperccgtxgvx.supabase.co/functions/v1/generate-thought';

export async function GET() {
  // must return JSON if you hit /api/generate in browser
  return NextResponse.json({ ok: true, route: '/api/generate' });
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { project_id, trigger = 'manual', limit_messages = 20 } = body || {};
    if (!project_id) {
      return NextResponse.json({ error: 'project_id required' }, { status: 400 });
    }

    // Use server-side key if present; else fall back to public anon key
    const apikey =
      process.env.SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      '';

    const upstream = await fetch(FUNCTION_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apikey ? { apikey } : {}),
      },
      body: JSON.stringify({ project_id, trigger, limit_messages }),
    });

    const ct = upstream.headers.get('content-type') || '';
    const isJSON = ct.includes('application/json');
    const payload = isJSON ? await upstream.json().catch(() => ({}))
                           : await upstream.text().catch(() => '');

    if (!upstream.ok) {
      return NextResponse.json(
        { error: typeof payload === 'string' ? payload : payload?.error || `HTTP ${upstream.status}` },
        { status: upstream.status }
      );
    }

    return NextResponse.json(
      typeof payload === 'object' ? payload : { ok: true, message: payload }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 504 });
  }
}