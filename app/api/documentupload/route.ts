  // app/api/documentupload/route.ts
  import { NextResponse } from 'next/server';
  import { supabaseAdmin } from '@/lib/supabaseAdmin';

  export const dynamic = 'force-dynamic'; // ensure server execution (App Router)
  export const runtime = 'nodejs';        // avoid edge Blob quirks

  function slugify(name: string) {
    return name.trim().replace(/[^\w.\-]+/g, '_');
  }

  export async function POST(req: Request) {
    try {
      const form = await req.formData();
      const file = form.get('file') as File | null;
      const projectId = (form.get('project_id') as string | null)?.trim();

      if (!file || !projectId) {
        return NextResponse.json({ error: 'Missing file or project_id' }, { status: 400 });
      }

      const cleanName = `${Date.now()}-${slugify(file.name || 'file')}`;
      const filePath = `${projectId}/${cleanName}`;

      // Upload bytes (more reliable than passing File directly)
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error: upErr } = await supabaseAdmin.storage
        .from('project-docs')
        .upload(filePath, bytes, {
          contentType: file.type || 'application/octet-stream',
          upsert: true,
        });
      if (upErr) {
        console.error('upload error:', upErr);
        return NextResponse.json({ error: upErr.message }, { status: 500 });
      }

      // Public URL (requires bucket to be public)
      const { data: urlData } = supabaseAdmin
        .storage
        .from('project-docs')
        .getPublicUrl(filePath);

      const publicUrl = urlData?.publicUrl || '';
      if (!publicUrl) {
        // Don’t fall back to signed URLs here — they expire and will break in your Files panel
        return NextResponse.json({
          error: "Bucket 'project-docs' isn't public. Make it public or switch to 'store path' approach."
        }, { status: 500 });
      }

      // Write to your table (you’re using project_files)
      const { data: pfRow, error: insErr } = await supabaseAdmin
        .from('project_files')
        .insert({
          project_id: projectId,
          file_name: file.name,
          file_url: publicUrl,
          uploaded_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (insErr) {
        console.error('project_files insert error:', insErr);
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }

      // (Optional) Log
      const { error: logErr } = await supabaseAdmin.from('system_logs').insert({
        project_id: projectId,
        actor: 'user',
        event: 'file.upload',
        details: {
          project_file_id: pfRow?.id ?? null,
          file_name: file.name,
          link_url: publicUrl,
          path: filePath,
          source: 'project_files',
        },
      });
      if (logErr) console.warn('system_logs write failed:', logErr);

      return NextResponse.json({ ok: true, file_name: file.name, url: publicUrl });
    } catch (e: any) {
      console.error('documentupload route error:', e?.message || e);
      return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
    }
  }
