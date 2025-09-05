// /app/api/project-files/route.ts
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const project_id = url.searchParams.get('project_id');
  if (!project_id) return NextResponse.json({ rows: [] });

  // Prefer DB (accurate ordering); fallback to storage listing
  const { data, error } = await supabase
    .from('documents')
    .select('id,file_name,file_url,created_at')
    .eq('project_id', project_id)
    .order('created_at', { ascending: false })
    .limit(5);

  if (!error && data?.length) {
    return NextResponse.json({
      rows: data.map((r) => ({
        id: r.id,
        file_name: r.file_name,
        file_url: r.file_url,
        uploaded_at: r.created_at,
      })),
    });
  }

  // fallback: list storage
  const base = `${project_id}/uploaded`;
  const { data: items } = await supabase.storage
    .from('project-docs')
    .list(base, { limit: 1000, sortBy: { column: 'name', order: 'desc' } });

  const rows =
    (items ?? [])
      .filter((it) => it.name && !it.name.endsWith('/'))
      .slice(0, 5)
      .map((it) => ({
        id: `${base}/${it.name}`,
        file_name: it.name,
        file_url: supabase.storage.from('project-docs').getPublicUrl(`${base}/${it.name}`).data.publicUrl,
        uploaded_at: it.created_at ?? null,
      })) || [];

  return NextResponse.json({ rows });
}
