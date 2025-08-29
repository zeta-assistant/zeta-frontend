// app/api/auth/resend/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '@/lib/supabaseAdmin'; // uses SERVICE_ROLE

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function getOrigin(req: Request) {
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || 'https';
  if (!host) return process.env.NEXT_PUBLIC_SITE_URL || '';
  return `${proto}://${host}`;
}

function getIp(req: Request) {
  const xf = req.headers.get('x-forwarded-for');
  return (xf?.split(',')[0].trim()) || '0.0.0.0';
}

export async function POST(req: Request) {
  try {
    // Optional header key gate (not a secret if exposed client-side; add CAPTCHA if needed)
    const requiredKey = process.env.RESEND_KEY;
    if (requiredKey) {
      const provided = req.headers.get('x-resend-key');
      if (provided !== requiredKey) {
        return NextResponse.json({ ok: true }, { status: 200 }); // generic (no enumeration)
      }
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    if (!email) {
      return NextResponse.json({ ok: true }, { status: 200 }); // generic
    }

    const ip = getIp(req);
    const now = Date.now();
    const thirtyMinAgoISO = new Date(now - 30 * 60 * 1000).toISOString();
    const dayAgoISO = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    // Rate limit: max 3 per 30m per email
    const { data: emailHits } = await supabaseAdmin
      .from('auth_resend_limits')
      .select('id')
      .eq('email', email.toLowerCase())
      .gte('window_start', thirtyMinAgoISO);

    if ((emailHits?.length || 0) >= 3) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Rate limit: max 10 per 24h per IP
    const { data: ipHits } = await supabaseAdmin
      .from('auth_resend_limits')
      .select('id')
      .eq('ip', ip)
      .gte('window_start', dayAgoISO);

    if ((ipHits?.length || 0) >= 10) {
      return NextResponse.json({ ok: true }, { status: 200 });
    }

    // Log this attempt
    await supabaseAdmin.from('auth_resend_limits').insert({
      email: email.toLowerCase(),
      ip,
      window_start: new Date().toISOString(),
    });

    // Send via Supabase
    const redirectTo = `${getOrigin(req)}/auth/confirm?next=/onboarding`;
    await supabaseAnon.auth.resend({
      type: 'signup',
      email,
      options: { emailRedirectTo: redirectTo },
    });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: true }, { status: 200 }); // keep generic
  }
}