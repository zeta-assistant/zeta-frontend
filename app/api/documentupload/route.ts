// Force Node.js runtime (needed for service-role key usage)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

function cleanName(name: string) {
  return name.replace(/[^\w.\-+]/g, '_');
}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get('file') as File | null;
    const project_id = String(form.get('project_id') || '');

    if (!file || !project_id) {
      return NextResponse.json({ error: 'Missing file or project_id' }, { status: 400 });
    }

    const arrayBuf = await file.arrayBuffer();
    const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
    const base = cleanName(file.name.replace(/\.[^.]+$/, ''));
    const stamp = Date.now().toString(36);
    const objectName = `${base}-${stamp}${ext ? `.${ext}` : ''}`;

    const storageKey = `${project_id}/uploaded/${objectName}`;

    const { error: upErr } = await supabase.storage
      .from('project-docs')
      .upload(storageKey, arrayBuf, {
        contentType: file.type || 'application/octet-stream',
        upsert: false,
      });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from('project-docs').getPublicUrl(storageKey);
    const publicUrl = pub.publicUrl;

   // after computing publicUrl
const { data: authUser } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }));

const { error: dbErr } = await supabase.from('documents').insert({
  project_id,                  // must be a valid UUID string
  file_name: file.name,
  file_url: publicUrl,
  created_by: 'user',
  user_id: authUser?.user?.id ?? null, // optional
});
if (dbErr) console.warn('documents insert failed:', dbErr.message);

    return NextResponse.json({ ok: true, file_url: publicUrl, file_name: file.name, storage_key: storageKey });
  } catch (e: any) {
    console.error('POST /documentupload', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Upload failed' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { project_id, storage_key, file_url, file_name } = await req.json();

    if (!project_id || (!storage_key && !file_url && !file_name)) {
      return NextResponse.json({ error: 'Missing project_id and key/url/name' }, { status: 400 });
    }

    const keyFromUrl = (url: string) => {
      const marker = '/object/public/project-docs/';
      const i = url?.indexOf?.(marker) ?? -1;
      return i >= 0 ? url.slice(i + marker.length) : '';
    };

    const resolvedKey =
      storage_key ||
      (file_url ? keyFromUrl(file_url) : '') ||
      (file_name ? `${project_id}/uploaded/${file_name}` : '');

    if (!resolvedKey) {
      return NextResponse.json({ error: 'Unable to resolve storage key' }, { status: 400 });
    }

    const { error: sErr } = await supabase.storage.from('project-docs').remove([resolvedKey]);
    if (sErr && !/not\s*found|does\s*not\s*exist/i.test(sErr.message)) throw sErr;

    const { data: pub } = supabase.storage.from('project-docs').getPublicUrl(resolvedKey);
    const pubUrl = pub.publicUrl;

    let q = supabase.from('documents').delete().eq('project_id', project_id);
    if (file_url) q = q.eq('file_url', file_url);
    else if (pubUrl) q = q.eq('file_url', pubUrl);
    else if (file_name) q = q.eq('file_name', file_name);
    const { error: dbErr } = await q;
    if (dbErr) throw dbErr;

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('DELETE /documentupload', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Delete failed' }, { status: 500 });
  }
}
