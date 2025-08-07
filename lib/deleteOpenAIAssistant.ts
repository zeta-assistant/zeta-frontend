import OpenAI from 'openai';

export async function deleteAssistantById(assistantId: string) {
  const openai = new OpenAI({
    apiKey: process.env.NEXT_PUBLIC_OPENAI_KEY || '', // frontend-safe ONLY if exposed
    dangerouslyAllowBrowser: true,
  });

  try {
    const deleted = await openai.beta.assistants.del(assistantId);
    return { success: true, data: deleted };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}
3. Modify handleDelete() in your component
Replace your current handleDelete function with this version:

ts
Copy
Edit
const handleDelete = async (projectId: string) => {
  const confirmed = confirm('Are you sure you want to delete this project? This action cannot be undone.');
  if (!confirmed || !userId) return;

  setLoading(true);
  console.log('🗑 Attempting to delete project:', projectId);

  try {
    // Get assistant_id from Supabase
    const { data: project, error: fetchError } = await supabase
      .from('user_projects')
      .select('assistant_id')
      .eq('id', projectId)
      .eq('user_id', userId)
      .single();

    if (fetchError) {
      console.error('❌ Failed to fetch assistant_id:', fetchError.message);
      alert('Failed to fetch project info.');
      setLoading(false);
      return;
    }

    let assistantId = project?.assistant_id;

    // If no assistantId, ask for one manually
    if (!assistantId) {
      assistantId = prompt('No assistant ID found in database.\nPlease enter Assistant ID to delete manually:') || '';
    }

    if (assistantId) {
      const { deleteAssistantById } = await import('@/lib/deleteOpenAIAssistant');
      const result = await deleteAssistantById(assistantId);

      if (!result.success) {
        console.error('❌ Failed to delete assistant:', result.error);
        alert('Assistant deletion failed.');
        setLoading(false);
        return;
      }

      console.log('✅ Assistant deleted from OpenAI:', result.data);
    }

    // Delete project from Supabase
    const { error: deleteError } = await supabase
      .from('user_projects')
      .delete()
      .eq('id', projectId)
      .eq('user_id', userId);

    if (deleteError) {
      console.error('❌ Failed to delete project:', deleteError.message);
      alert('Failed to delete project.');
    } else {
      console.log('✅ Project deleted from Supabase');
      setProjects((prev) => prev.filter((proj) => proj.id !== projectId));
    }
  } catch (err) {
    console.error('❌ Unexpected deletion error:', err);
    alert('Unexpected error during deletion.');
  }

  setLoading(false);
};