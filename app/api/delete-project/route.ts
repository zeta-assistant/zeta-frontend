import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const { projectId, userId } = await req.json();
    if (!projectId || !userId) {
      return NextResponse.json({ error: 'Missing projectId or userId' }, { status: 400 });
    }

    // Verify the project belongs to the caller
    const { data: owner, error: ownerErr } = await supabaseAdmin
      .from('user_projects')
      .select('user_id')
      .eq('id', projectId)
      .single();

    if (ownerErr) {
      return NextResponse.json({ error: `Project lookup failed: ${ownerErr.message}` }, { status: 404 });
    }
    if (!owner || owner.user_id !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Best-effort cascade deletes (adjust table names if yours differ)
    const tables: Array<{ table: string; col: 'project_id' | 'id' }> = [
      { table: 'threads', col: 'project_id' },
      { table: 'goals', col: 'project_id' },
      { table: 'task_items', col: 'project_id' },
      { table: 'calendar_items', col: 'project_id' },
      { table: 'notification_jobs', col: 'project_id' },
      { table: 'notification_rules', col: 'project_id' },
      { table: 'project_integrations', col: 'project_id' },
      { table: 'documents', col: 'project_id' },
      { table: 'mainframe_info', col: 'id' }, // row id == project id
    ];

    for (const t of tables) {
      const { error } = await supabaseAdmin
        .from(t.table)
        .delete()
        .eq(t.col, projectId);
      if (error) {
        console.warn(`Delete warning on ${t.table}:`, error.message);
      }
    }

    // Finally delete the project itself
    const { error: delErr } = await supabaseAdmin
      .from('user_projects')
      .delete()
      .eq('id', projectId);

    if (delErr) {
      return NextResponse.json({ error: `Delete failed: ${delErr.message}` }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Unknown error' }, { status: 500 });
  }
}
