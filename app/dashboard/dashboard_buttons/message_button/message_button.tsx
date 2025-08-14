'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function MessageButton({ projectId }: { projectId: string }) {
  const [sendingMsg, setSendingMsg] = useState(false);
  const router = useRouter();

  const handleMessageMe = async () => {
    setSendingMsg(true);

    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25_000); // 25s hard cap

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      const res = await fetch(
        'https://inprydzukperccgtxgvx.supabase.co/functions/v1/daily-chat-message',
        {
          method: 'POST',
          signal: ctl.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
            ...(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
              ? { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
              : {}),
          },
          body: JSON.stringify({ project_id: projectId, trigger: 'manual' }),
          // keepalive helps if user navigates away (small payloads only)
          keepalive: true,
        }
      );

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.error('daily-chat-message failed:', res.status, text);
        alert('Failed to send message. Check logs.');
        return;
      }

      // success -> refresh any UI that depends on it
      router.refresh();
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        // Likely long-running function; request was triggered successfully.
        console.warn('daily-chat-message timed out locally; continuing in background.');
        // Optional: toast instead of alert
        // alert('Message is processing in the background and should appear shortly.');
      } else {
        console.error(e);
        alert('Something went wrong triggering the message.');
      }
    } finally {
      clearTimeout(timer);
      setSendingMsg(false);
    }
  };

  return (
    <button
      onClick={handleMessageMe}
      disabled={sendingMsg}
      className={`mt-2 w-11 h-11 text-xl flex items-center justify-center rounded-full border ${
        sendingMsg
          ? 'bg-gray-300 text-gray-600 cursor-not-allowed border-gray-300'
          : 'text-yellow-600 bg-white hover:bg-yellow-100 border-yellow-300'
      }`}
      title={sendingMsg ? 'Sending…' : 'Message Me'}
    >
      {sendingMsg ? '…' : '✉️'}
    </button>
  );
}