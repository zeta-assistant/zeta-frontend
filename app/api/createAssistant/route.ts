import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import axios from 'axios';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      projectName,
      assistantType,
      systemInstructions,
      projectId,
      fileUrls,
    } = body;

    if (!projectName || !assistantType || !projectId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const OPENAI_API_KEY = process.env.OPENAI_KEY;
    if (!OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Missing OpenAI API Key' }, { status: 500 });
    }

    const fileIds: string[] = [];

    // Step 1: Upload files to OpenAI
    for (const filePath of fileUrls) {
      const { data: publicUrlData } = supabaseAdmin.storage
        .from('project-docs')
        .getPublicUrl(filePath);

      const publicUrl = publicUrlData.publicUrl;
      const fileResponse = await fetch(publicUrl);
      const arrayBuffer = await fileResponse.arrayBuffer();
      const blob = new Blob([arrayBuffer]);

      const formData = new FormData();
      formData.append('file', blob, filePath.split('/').pop());
      formData.append('purpose', 'assistants');

      const uploadRes = await axios.post(
        'https://api.openai.com/v1/files',
        formData,
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'OpenAI-Beta': 'assistants=v2',
            // Axios-specific workaround for multipart headers
            ...(formData as any).getHeaders?.(),
          },
        }
      );

      fileIds.push(uploadRes.data.id);
    }

    // ✅ Step 2: Create Assistant using AXIOS
    const createRes = await axios.post(
      'https://api.openai.com/v1/assistants',
      {
        name: projectName,
        instructions: systemInstructions || 'You are a helpful assistant.',
        tools: [{ type: 'file_search' }],
        model: 'gpt-4o',
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
          'OpenAI-Beta': 'assistants=v2',
        },
      }
    );

    const assistantId = createRes.data.id;

    // ✅ Step 3: Attach Files using AXIOS
    for (const fileId of fileIds) {
      await axios.post(
  `https://api.openai.com/v1/assistants/${assistantId}/files`,
  { file_id: fileId },
  {
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Beta': 'assistants=v2',
    },
  }
);
    }

    // Step 4: Update Supabase
    const { error: updateError } = await supabaseAdmin
      .from('user_projects')
      .update({ assistant_id: assistantId })
      .eq('id', projectId);

    if (updateError) throw updateError;

    return NextResponse.json({ assistantId }, { status: 200 });
  } catch (err: any) {
    console.error('❌ Assistant creation error:', err);
    return NextResponse.json({ error: err.message || 'Server error' }, { status: 500 });
  }
}
