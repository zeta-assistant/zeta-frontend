export type ZetaModel = {
  id: string;
  label: string;
  provider: 'openai' | 'local' | 'huggingface' | 'anthropic';
  contextWindow: number;
  apiRoute: string;
  tokenCost?: number;
  disabled?: boolean;
};
export const AVAILABLE_MODELS: ZetaModel[] = [
  {
    id: 'gpt-4o',
    label: 'GPT-4o (OpenAI)',
    provider: 'openai',
    contextWindow: 128000,
    apiRoute: '/api/openai/chat',
    tokenCost: 0.01,
  },
  {
    id: 'mistral-7b',
    label: 'Mistral 7B (Local)',
    provider: 'local',
    contextWindow: 8192,
    apiRoute: '/api/local/mistral',
  },
  {
    id: 'phi-2',
    label: 'Phi-2 (Local)',
    provider: 'local',
    contextWindow: 4096,
    apiRoute: '/api/local/phi2',
  },
  {
    id: 'deepseek-chat',
    label: 'DeepSeek Chat (Local)',
    provider: 'local',
    contextWindow: 8192,
    apiRoute: '/api/local/deepseek', // 🔁 use your real route here
  },
];