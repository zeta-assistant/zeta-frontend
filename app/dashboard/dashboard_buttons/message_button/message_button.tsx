'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type Props = {
  projectId: string;
  /** Optional: pass ChatTab's onRefresh so the chat updates immediately */
  onAfterSend?: () => Promise<void> | void;
};

export default function MessageButton({ projectId, onAfterSend }: Props) {
  const [sending, setSending] = useState(false);
  const router = useRouter();

  const SB_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const SB_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const FN_URL = `${SB_URL}/functions/v1/daily-chat-message`;

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const refreshChat = async () => {
    if (onAfterSend) {
      await onAfterSend();
    } else {
      // fallback: soft refresh of the page cache
      router.refresh();
    }
  };

  const handleClick = async () => {
    if (sending) return;
    setSending(true);

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25_000); // 25s client cap

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch(FN_URL, {
        method: 'POST',
        signal: ctl.signal,
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          ...(SB_ANON ? { apikey: SB_ANON } : {}),
        },
        body: JSON.stringify({ project_id: projectId, trigger: 'manual' }),
        keepalive: true,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('daily-chat-message failed:', res.status, text);
        alert('Failed to send message. Check logs.');
        return;
      }

      // Success path: the function returned quickly—refresh now.
      await refreshChat();
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // Likely still running server-side. Do a tiny grace poll (no Promise.race).
        for (let i = 0; i < 6; i++) {
          await sleep(1000);
          const { data, error } = await supabase
            .from('zeta_conversation_log')
            .select('id')
            .eq('project_id', projectId)
            .eq('role', 'assistant')
            .order('timestamp', { ascending: false })
            .limit(1);
          if (!error && Array.isArray(data) && data.length) break;
        }
        await refreshChat();
      } else {
        console.error(e);
        alert('Something went wrong triggering the message.');
      }
    } finally {
      clearTimeout(timer);
      setSending(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={sending}
      className={`mt-2 w-11 h-11 text-xl flex items-center justify-center rounded-full border ${
        sending
          ? 'bg-gray-300 text-gray-600 cursor-not-allowed border-gray-300'
          : 'text-yellow-600 bg-white hover:bg-yellow-100 border-yellow-300'
      }`}
      title={sending ? 'Sending…' : 'Message Me'}
      aria-busy={sending}
    >
      {sending ? '…' : '✉️'}
    </button>
  );
}
