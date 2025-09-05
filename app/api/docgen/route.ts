// app/api/docgen/route.ts
// Force Node.js runtime (service role required for Storage + DB writes)
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
  return name.trim().replace(/[^\w.\-+]/g, '_');
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    // Accept both snake_case and camelCase from clients
    const project_id: string = String(body.project_id ?? body.projectId ?? '').trim();
    if (!project_id) {
      return NextResponse.json({ error: 'Missing project_id' }, { status: 400 });
    }

    // Inputs (direct)
    let filename: string = String(body.filename ?? '').trim();
    let content: string | undefined =
      typeof body.content === 'string' ? (body.content as string) : undefined;
    const base64: string | undefined =
      typeof body.base64 === 'string' ? (body.base64 as string) : undefined;
    let content_type: string = String(body.content_type ?? '').trim();

    // Back-compat / convenience inputs
    const fileType: 'markdown' | 'text' | 'csv' | 'json' | undefined = body.fileType;
    const description: string =
      typeof body.description === 'string' ? (body.description as string) : '';

    // Maps for fallback synthesis
    const ctypeFor: Record<string, string> = {
      markdown: 'text/markdown; charset=utf-8',
      text: 'text/plain; charset=utf-8',
      csv: 'text/csv; charset=utf-8',
      json: 'application/json; charset=utf-8',
    };
    const extFor: Record<string, string> = {
      markdown: 'md',
      text: 'txt',
      csv: 'csv',
      json: 'json',
    };

    // If caller didn’t pass content/base64 but did pass fileType/description, synthesize content
    if (!content && !base64 && fileType) {
      if (!filename) filename = 'New_Document';
      const ext = extFor[fileType] || 'txt';
      if (!/\.[A-Za-z0-9]{1,8}$/.test(filename)) filename = `${filename}.${ext}`;
      const d = description.trim();

      if (fileType === 'markdown') {
        const title = filename.replace(/\.[^.]+$/, '');
        content = `# ${title}\n\n${d || '...'}\n`;
      } else if (fileType === 'text') {
        content = d || '...';
      } else if (fileType === 'csv') {
        content = /[,\n]/.test(d) ? d : `text\n"${d.replace(/"/g, '""')}"\n`;
      } else if (fileType === 'json') {
        try {
          JSON.parse(d);
          content = d;
        } catch {
          content = JSON.stringify({ description: d }, null, 2);
        }
      } else {
        content = d || '...';
      }

      if (!content_type) content_type = ctypeFor[fileType];
    }

    // Ensure filename + content_type defaults
    if (!filename) {
      const ext =
        /markdown/i.test(content_type) ? 'md' :
        /json/i.test(content_type) ? 'json' :
        /html/i.test(content_type) ? 'html' :
        /csv/i.test(content_type) ? 'csv' :
        /text/i.test(content_type) ? 'txt' : 'txt';
      filename = `generated_${Date.now().toString(36)}.${ext}`;
    }
    if (!content_type) content_type = 'text/plain; charset=utf-8';

    // Normalize filename -> object name with unique stamp
    const base = filename.replace(/\.[^.]+$/, '');
    const ext = filename.includes('.') ? filename.split('.').pop() : '';
    const stamp = Date.now().toString(36);
    const objectName = `${cleanName(base)}-${stamp}${ext ? `.${ext}` : ''}`;
    const storage_key = `${project_id}/generated/${objectName}`;

    // Build bytes (Node-safe; prefer base64 if provided)
    let bytes: Uint8Array;
    if (typeof base64 === 'string' && base64.length) {
      const raw = base64.includes(',') ? base64.split(',', 2)[1] : base64;
      bytes = Uint8Array.from(Buffer.from(raw, 'base64'));
    } else if (typeof content === 'string') {
      bytes = new TextEncoder().encode(content);
    } else {
      return NextResponse.json(
        { error: 'Provide content (string) or base64 or fileType/description' },
        { status: 400 }
      );
    }

    // Upload to Storage under /generated
    const { error: upErr } = await supabase.storage
      .from('project-docs')
      .upload(storage_key, bytes, { contentType: content_type || 'application/octet-stream', upsert: false });
    if (upErr) throw upErr;

    const { data: pub } = supabase.storage.from('project-docs').getPublicUrl(storage_key);
    const file_url = pub.publicUrl;

    // Optional: audit in documents (created_by: 'zeta')
    const { error: insErr } = await supabase.from('documents').insert({
      project_id,
      file_name: objectName,
      file_url,
      storage_key,
      created_by: 'zeta',
      user_id: null,
    });
    if (insErr) {
      // Non-fatal, but log server-side
      console.warn('documents insert failed:', insErr.message);
    }

    return NextResponse.json({
      ok: true,
      project_id,
      file_name: objectName,
      storage_key,
      file_url,
      content_type,
    });
  } catch (e: any) {
    console.error('POST /docgen', e?.message || e);
    return NextResponse.json({ error: e?.message || 'Docgen failed' }, { status: 500 });
  }
}
