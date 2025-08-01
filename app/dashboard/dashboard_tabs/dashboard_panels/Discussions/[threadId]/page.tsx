'use client';
import React, { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';

export default function DiscussionThreadPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const thread_id = params.threadId as string;

  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // 🧠 Replace this with a real fetch from OpenAI or Supabase later
    setMessages([
      { role: 'assistant', content: 'Welcome to this thread!' },
      { role: 'user', content: 'Okay, let’s discuss Week 5.' },
    ]);
  }, []);

  const sendMessage = async () => {
    if (!input.trim()) return;

    setMessages((prev) => [...prev, { role: 'user', content: input }]);
    setInput('');
    setLoading(true);

    // 🧠 Replace this with OpenAI or your backend call
    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: 'Got it. I’ll analyze Week 5 performance now.' },
      ]);
      setLoading(false);
    }, 1000);
  };

  return (
    <div className="p-6 text-white min-h-screen flex flex-col bg-blue-950">
      <h1 className="text-xl font-bold mb-4">🧵 Discussion: {thread_id}</h1>

      <div className="flex-1 overflow-y-auto space-y-4" ref={scrollRef}>
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`max-w-[80%] p-3 rounded-xl shadow ${
              msg.role === 'user'
                ? 'ml-auto bg-purple-700'
                : 'mr-auto bg-blue-800'
            }`}
          >
            {msg.content}
          </div>
        ))}
      </div>

      <div className="mt-6 flex gap-2">
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