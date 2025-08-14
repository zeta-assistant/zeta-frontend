'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function ThoughtButton({ projectId }: { projectId: string }) {
  const [generating, setGenerating] = useState(false);
  const router = useRouter();

  const handleGenerateThought = async () => {
    setGenerating(true);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25_000);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (session?.access_token) headers.Authorization = `Bearer ${session.access_token}`;

      const res = await fetch('/api/thoughts/generate', {
        method: 'POST',
        signal: ctl.signal,
        headers,
        body: JSON.stringify({ project_id: String(projectId), trigger: 'manual' }),
      });

      const ct = res.headers.get('content-type') || '';
      const body =
        ct.includes('application/json')
          ? await res.json().catch(() => ({}))
          : await res.text().catch(() => '');

      if (!res.ok) {
        const msg =
          typeof body === 'object'
            ? (body as any)?.error ?? JSON.stringify(body)
            : (body as string) || `HTTP ${res.status}`;
        alert(`Generate failed: ${msg}`);
        return;
      }

      router.refresh();
    } catch (e: any) {
      alert(
        `Generate error: ${
          e?.name === 'AbortError' ? 'Request timed out' : e?.message || String(e)
        }`
      );
    } finally {
      clearTimeout(timer);
      setGenerating(false);
    }
  };

  return (
    <button
      onClick={handleGenerateThought}
      disabled={generating}
      className="text-yellow-600 bg-white hover:bg-yellow-100 border border-yellow-300 rounded-full w-11 h-11 text-xl flex items-center justify-center shadow-lg transition"
      title="Generate Thought"
    >
      💡
    </button>
  );
}
