import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id') ?? '';
  if (!projectId) return NextResponse.json({ rows: [] });

  const { data, error } = await supabaseAdmin
    .from('project_files')
    .select('id, file_name, file_url, uploaded_at')
    .eq('project_id', projectId)
    .order('uploaded_at', { ascending: false })
    .limit(5);

  if (error) {
    console.error('project_files fetch error:', error);
    return NextResponse.json({ rows: [] }, { status: 500 });
  }
  return NextResponse.json({ rows: data ?? [] });
}