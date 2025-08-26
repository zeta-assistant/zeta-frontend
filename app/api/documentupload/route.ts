import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const projectId = (formData.get('project_id') as string | null)?.trim();

    if (!file || !projectId) {
      return NextResponse.json({ error: 'Missing file or project_id' }, { status: 400 });
    }

    const fileName = `${Date.now()}-${file.name}`;
    const filePath = `${projectId}/${fileName}`;

    // 1) Upload to Storage (service key – bypasses RLS)
    const { error: upErr } = await supabaseAdmin.storage
      .from('project-docs')
      .upload(filePath, file, { contentType: file.type });

    if (upErr) {
      console.error('upload error:', upErr);
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    // 2) Public (or signed) URL for viewing
    let publicUrl =
      supabaseAdmin.storage.from('project-docs').getPublicUrl(filePath).data.publicUrl;

    if (!publicUrl) {
      const { data: signed, error: sErr } = await supabaseAdmin.storage
        .from('project-docs')
        .createSignedUrl(filePath, 60 * 60);
      if (sErr) console.warn('signed url error:', sErr);
      publicUrl = signed?.signedUrl ?? filePath;
    }

    // 3) Record in public.project_files
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

    // 4) Log it (so LogsPanel updates via realtime)
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