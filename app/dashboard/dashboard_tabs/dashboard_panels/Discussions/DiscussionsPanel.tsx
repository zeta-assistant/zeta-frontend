'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { NewDiscussionForm } from '@/components/NewDiscussionForm';

type Discussion = {
  thread_id: string;
  title: string;
};

type Message = {
  role: 'user' | 'assistant';
  content: string;
};

export default function DiscussionsPanel({ fontSize }: { fontSize: 'sm' | 'base' | 'lg' }) {
  const { projectId } = useParams();
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [selectedThread, setSelectedThread] = useState<Discussion | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('discussions')
        .select('thread_id, title')
        .eq('project_id', projectId)
        .order('last_updated', { ascending: false });
      setDiscussions(data || []);
    })();
  }, [projectId]);

  useEffect(() => {
    if (!selectedThread) return;
    setMessages([
      { role: 'assistant', content: 'Welcome to this thread!' },
      { role: 'user', content: 'Okay, let’s discuss Week 5.' },
    ]);
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedThread]);

  const sendMessage = async () => {
    if (!input.trim()) return;
    const userMsg = { role: 'user' as const, content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Got it. I’ll analyze Week 5 performance now.' },
      ]);
      setLoading(false);
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 1000);
  };

  if (showNewForm) {
    return (
      <div className={`p-6 text-${fontSize} text-indigo-200 bg-blue-950`}>
        <h2 className="text-lg text-white font-semibold mb-4">➕ Start a New Discussion</h2>
        <NewDiscussionForm
          onCreate={(newDiscussion: Discussion) => {
            setShowNewForm(false);
            setSelectedThread(newDiscussion);
            setDiscussions((prev) => [newDiscussion, ...prev]);
          }}
        />
        <button
          onClick={() => setShowNewForm(false)}
          className="mt-4 text-sm text-pink-400 hover:text-pink-200"
        >
          ← Cancel
        </button>
      </div>
    );
  }

  if (!selectedThread) {
    return (
      <div className={`p-6 overflow-y-auto text-${fontSize} text-indigo-200 space-y-6 bg-blue-950`}>
        <div className="flex justify-between items-center">
          <h2 className="text-lg text-white font-semibold">💬 Choose a Discussion</h2>
          <button
            onClick={() => setShowNewForm(true)}
            className="bg-pink-600 hover:bg-pink-700 text-white px-3 py-1 rounded shadow text-sm"
          >
            ➕ New Discussion
          </button>
        </div>
        {discussions.length === 0 ? (
          <p className="text-gray-400">No discussions yet.</p>
        ) : (
          discussions.map((d) => (
            <div
              key={d.thread_id}
              onClick={() => setSelectedThread(d)}
              className="cursor-pointer bg-purple-700 hover:bg-purple-800 px-4 py-3 rounded-xl shadow text-white transition"
            >
              {d.title}
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className={`p-6 overflow-y-auto text-${fontSize} text-indigo-200 space-y-6 bg-blue-950 flex flex-col`}>
      <div className="flex justify-between items-center">
        <h2 className="text-lg text-white font-semibold">
          🧵 Discussion: {selectedThread.title || selectedThread.thread_id}
        </h2>
        <button
          onClick={() => setSelectedThread(null)}
          className="text-sm text-pink-400 hover:text-pink-200"
        >
          ← Back
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[80%] p-3 rounded-xl shadow ${
              msg.role === 'user' ? 'ml-auto bg-purple-700 text-white' : 'mr-auto bg-blue-800 text-white'
            }`}
          >
            {msg.content}
          </div>
        ))}
        <div ref={scrollRef} />
      </div>

      <div className="mt-4 flex gap-2">
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