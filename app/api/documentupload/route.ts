import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const projectId = formData.get('project_id') as string;

  if (!file || !projectId) {
    console.error("❌ Missing file or project_id");
    return NextResponse.json({ error: 'Missing file or project_id' }, { status: 400 });
  }

  const fileName = `${Date.now()}-${file.name}`;
  const filePath = `${projectId}/${fileName}`;

  console.log("📦 Uploading:", fileName);

  const { data, error } = await supabaseAdmin.storage
    .from('project-docs')
    .upload(filePath, file, {
      contentType: file.type,
    });

  if (error) {
    console.error("❌ Upload failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { publicUrl } = supabaseAdmin.storage
    .from('project-docs')
    .getPublicUrl(filePath).data;

  const insertRes = await supabaseAdmin.from('documents').insert({
    project_id: projectId,
    file_name: file.name,
    file_url: publicUrl,
  });

  if (insertRes.error) {
    console.error("❌ DB insert failed:", insertRes.error.message);
    return NextResponse.json({ error: insertRes.error.message }, { status: 500 });
  }

  return NextResponse.json({ message: '✅ Upload complete!' });
}