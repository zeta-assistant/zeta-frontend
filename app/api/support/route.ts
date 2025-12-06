// app/api/support/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// optional but nice to be explicit
export const runtime = 'nodejs';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const name = (formData.get('name') as string) || '';
    const email = (formData.get('email') as string) || '';
    const subject = (formData.get('subject') as string) || '';
    const message = (formData.get('message') as string) || '';
    const userId = (formData.get('user_id') as string) || null;

    if (!email || !subject || !message) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 },
      );
    }

    const files = formData.getAll('files') as File[];
    const attachmentPaths: string[] = [];

    if (files && files.length > 0) {
      for (const file of files) {
        try {
          if (!file || file.size === 0) continue;

          const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
          const filePath = `${userId || 'anonymous'}/${Date.now()}-${safeName}`;

          const { error: uploadErr } = await supabaseAdmin.storage
            .from('support-uploads')
            .upload(filePath, file, {
              contentType: file.type || 'application/octet-stream',
              upsert: false,
            });

          if (uploadErr) {
            console.error('Support upload error:', uploadErr);
            continue;
          }

          attachmentPaths.push(filePath);
        } catch (fileErr) {
          console.error('Support file loop error:', fileErr);
        }
      }
    }

    const { error: insertErr } = await supabaseAdmin.from('support_tickets').insert({
      user_id: userId,
      email,
      name,
      subject,
      message,
      attachment_urls: attachmentPaths,
    });

    if (insertErr) {
      console.error('Support ticket insert error:', insertErr);
      return NextResponse.json(
        { success: false, error: 'Failed to save support request (DB error)' },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Support request stored successfully',
    });
  } catch (err) {
    console.error('Support route error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to process request' },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
