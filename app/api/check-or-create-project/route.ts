import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export async function POST(req: Request) {
  try {
    const { userId, type = 'zeta' } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Check for existing project
    const { data: projects, error: fetchError } = await supabaseAdmin
      .from('user_projects')
      .select('*')
      .eq('user_id', userId)
    

    if (fetchError) {
      console.error('⚠️ Supabase fetch error:', fetchError.message);
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (projects && projects.length > 0) {
      return NextResponse.json({ project: projects[0] }, { status: 200 });
    }

    // Insert new project
    const { data: newProject, error: insertError } = await supabaseAdmin
      .from('user_projects')
      .insert([
        {
          user_id: userId,
          name: `New ${type.charAt(0).toUpperCase() + type.slice(1)} Project`,
          type,
          description: `Your personal ${type} assistant is ready.`,
          onboarding_complete: false,
          created_at: new Date().toISOString(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error('❌ Supabase insert error:', insertError.message);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ project: newProject }, { status: 200 });

  } catch (err: any) {
    console.error('🚨 Unexpected error in route:', err.message || err);
    return NextResponse.json({ error: err.message || 'Unknown error' }, { status: 500 });
  }
}
