import OpenAI from 'openai';

export async function deleteAssistantById(assistantId: string) {
  const openai = new OpenAI({
    apiKey: process.env.NEXT_PUBLIC_OPENAI_KEY || '', // frontend-safe ONLY if exposed
    dangerouslyAllowBrowser: true,
  });

  try {
    const deleted = await openai.beta.assistants.delete(assistantId);
    return { success: true, data: deleted };
  } catch (error: any) {
    return { success: false, error: error.message || 'Unknown error' };
  }
}