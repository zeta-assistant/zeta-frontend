'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import CurrentMemoryPanel from '@/components/CurrentMemoryPanel';

export default function DashboardPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
  const checkSession = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session || !session.user || !session.user.email) {
      router.push('/login');
    } else {
      setUserEmail(session.user.email as string); // ✅ this line fixes the type error
    }

    setSessionLoading(false);
  };

  checkSession();
}, []);
  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      const res = await fetch(
        'https://inprydzukperccgtxgvx.functions.supabase.co/functions/v1/chatwithzeta',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({ message: input }),
        }
      );

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '⚠️ Server error. Try again later.' },
        ]);
        return;
      }

      const data = await res.json();
      const replyMessage = {
        role: 'assistant',
        content: data.reply || '⚠️ No reply received.',
      };
      setMessages((prev) => [...prev, replyMessage]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '⚠️ Failed to reach Zeta.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendMessage();
  };

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error('Logout failed:', error.message);
      alert('Logout failed. Try again.');
    } else {
      router.replace('/');
    }
  };

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-600">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdf6ee] px-6 py-8 flex flex-col items-center">
      <div className="flex w-full max-w-7xl gap-6">
        {/* Main Chat Panel */}
        <div className="flex flex-col flex-[3] bg-white shadow border rounded-2xl h-[70vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              🧠 Zeta Assistant
            </h1>
            <button
              onClick={handleLogout}
              className="text-sm px-4 py-2 bg-[#1f1f3d] text-white rounded-md hover:bg-[#333]"
            >
              Log Out
            </button>
          </div>

          {/* User Info */}
          {userEmail && (
            <p className="text-sm text-gray-600 px-6 pt-3">
              Signed in as <span className="font-medium">{userEmail}</span>
            </p>
          )}

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`max-w-[85%] px-4 py-2 rounded-xl whitespace-pre-line text-sm ${
                  msg.role === 'user'
                    ? 'bg-blue-100 text-black self-end ml-auto'
                    : 'bg-gray-100 text-gray-800 self-start'
                }`}
              >
                {msg.content}
              </div>
            ))}
            <div ref={scrollRef} />
          </div>

          {/* Chat Input (Restyled clean) */}
          <div className="border-t px-3 py-3 bg-white flex">
            <input
              type="text"
              className="appearance-none bg-white text-black border border-gray-300 rounded-l-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm max-w-2xl autofill:shadow-[inset_0_0_0px_1000px_white] autofill:text-black"
              placeholder="Ask Zeta something..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              className="bg-purple-500 text-white px-5 rounded-r-md text-sm hover:bg-purple-600 transition"
            >
              {loading ? '...' : 'Send'}
            </button>
          </div>
        </div>

        {/* Memory Panel */}
        <aside className="flex-[1] bg-yellow-400 rounded-2xl p-6 shadow h-[70vh] overflow-y-auto">
          <CurrentMemoryPanel />
        </aside>
      </div>

      {/* Space below for widgets */}
      <div className="w-full max-w-7xl mt-10">
        <div className="text-center text-gray-400 text-sm italic">
          [ Space reserved for insights / charts / widgets ]
        </div>
      </div>
    </div>
  );
}
