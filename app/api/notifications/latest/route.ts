import supabase from '@/lib/supabaseServer'; // default import is safest
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ error: 'Missing projectId' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('mainframe_info')
      .select('latest_notification, updated_at')
      .eq('project_id', projectId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const notification = data
      ? {
          id: null,
          title: null,
          body: data.latest_notification ?? null,
          created_at: data.updated_at ?? new Date().toISOString(),
        }
      : null;

    return NextResponse.json({ notification });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown server error' }, { status: 500 });
  }
}