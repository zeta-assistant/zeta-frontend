'use client';

import React, { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { supabase } from '@/lib/supabaseClient';

type Message = {
  id?: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
};

export function ThreadChatTab({
  threadId,
  fontSize,
}: {
  threadId: string;
  fontSize: 'sm' | 'base' | 'lg';
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('discussion_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('timestamp', { ascending: true });
      setMessages(data || []);
    })();
  }, [threadId]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    setLoading(true);
    const inputCopy = input;
    setInput('');

    // Insert user message
    const { data: savedUserMsg, error: userError } = await supabase
      .from('discussion_messages')
      .insert({
        thread_id: threadId,
        role: 'user',
        content: inputCopy,
      })
      .select()
      .single();

    if (userError || !savedUserMsg) {
      console.error('❌ Failed to save user message:', userError?.message);
      setLoading(false);
      return;
    }

    setMessages((prev) => [...prev, savedUserMsg]);
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });

    // Send to API for assistant reply
    const res = await fetch('/api/discussion-reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: inputCopy, threadId }),
    });

    const { reply } = await res.json();

    if (reply) {
      setMessages((prev) => [
        ...prev,
        {
          thread_id: threadId,
          role: 'assistant',
          content: reply,
        },
      ]);
    }

    setLoading(false);
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
  <div className="flex flex-col flex-1 min-h-0">
    {/* 💬 Scrollable chat container */}
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
      {messages.map((msg, i) => (
        <div
          key={i}
          className={`max-w-[80%] p-3 rounded-xl shadow ${
            msg.role === 'user'
              ? 'ml-auto bg-purple-700 text-white'
              : 'mr-auto bg-blue-800 text-white'
          }`}
        >
          <ReactMarkdown>{msg.content}</ReactMarkdown>
        </div>
      ))}
      {loading && (
        <div className="text-white text-sm animate-pulse">Zeta is typing...</div>
      )}
      <div ref={scrollRef} />
    </div>

    {/* 📝 Input Bar */}
    <div className="shrink-0 border-t border-indigo-400 px-4 py-3 flex items-center gap-3 bg-blue-950">
      <input
        className="flex-1 p-3 rounded-xl bg-blue-900 border border-purple-400 text-white"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type a message..."
        onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
      />
      <button
        onClick={sendMessage}
        disabled={loading}
        className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl"
      >
        Send
      </button>
    </div>
  </div>
);
}