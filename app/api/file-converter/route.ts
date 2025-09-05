// app/api/file-converter/route.ts
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function cleanName(name: string) {
  return name.trim().replace(/[^\w.\-+]/g, '_');
}

// Quick health check so you can visit in the browser
export async function GET() {
  return NextResponse.json({ ok: true, msg: 'file-converter alive' });
}

// CORS/preflight (optional, but avoids 405 in some setups)
export async function OPTIONS() {
  return NextResponse.json({}, { headers: { 'Allow': 'GET,POST,OPTIONS' } });
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const project_id = String(form.get('project_id') ?? '').trim();
    let format = String(form.get('format') ?? '').toLowerCase();

    if (!file || !project_id || !format) {
      return NextResponse.json({ error: 'Missing file, project_id, or format' }, { status: 400 });
    }

    if (format === 'jpeg') format = 'jpg';
    if (!['png', 'jpg', 'webp'].includes(format)) {
      return NextResponse.json({ error: 'Unsupported format (png|jpg|webp)' }, { status: 400 });
    }

    const inputBuf = Buffer.from(await file.arrayBuffer());
    let pipeline = sharp(inputBuf);
    let contentType = 'application/octet-stream';

    if (format === 'png') {
      pipeline = pipeline.png();
      contentType = 'image/png';
    } else if (format === 'jpg') {
      pipeline = pipeline.jpeg({ quality: 90 });
      contentType = 'image/jpeg';
    } else if (format === 'webp') {
      pipeline = pipeline.webp({ quality: 90 });
      contentType = 'image/webp';
    }

    const outBuffer = await pipeline.toBuffer();

    const base = cleanName(file.name.replace(/\.[^.]+$/, ''));
    const stamp = Date.now().toString(36);
    const objectName = `${base}-converted-${stamp}.${format}`;
    const storage_key = `${project_id}/generated/${objectName}`;

    const { error: upErr } = await supabase.storage
      .from('project-docs')
      .upload(storage_key, outBuffer, { contentType, upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from('project-docs').getPublicUrl(storage_key);
    const file_url = pub.publicUrl;

    const { error: insErr } = await supabase.from('documents').insert({
      project_id,
      file_name: objectName,
      file_url,
      storage_key,
      created_by: 'zeta',
      user_id: null,
    });
    if (insErr) console.warn('documents insert failed:', insErr.message);

    return NextResponse.json({
      ok: true,
      project_id,
      file_name: objectName,
      storage_key,
      file_url,
      content_type: contentType,
    });
  } catch (e: any) {
    console.error('POST /file-converter', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Convert failed' }, { status: 500 });
  }
}
