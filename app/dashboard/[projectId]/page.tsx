'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import CurrentMemoryPanel from '@/components/CurrentMemoryPanel';

export default function DashboardPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [projectName, setProjectName] = useState<string>('Loading...');
  const [sessionLoading, setSessionLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  useEffect(() => {
    const checkSessionAndProject = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session || !session.user?.email) {
        router.push('/login');
        return;
      }

      setUserEmail(session.user.email);

      const { data: project, error: projectError } = await supabase
        .from('user_projects')
        .select('name, user_id')
        .eq('id', projectId)
        .single();

      if (projectError || !project || project.user_id !== session.user.id) {
        console.error('Access denied or project not found');
        router.push('/projects');
        return;
      }

      setProjectName(project.name);
      setSessionLoading(false);
    };

    checkSessionAndProject();
  }, [projectId]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(
        'https://inprydzukperccgtxgvx.functions.supabase.co/functions/v1/chatwithzeta',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            message: input,
            projectId,
            projectName,
            userEmail,
          }),
        }
      );

      const data = await res.json();
      const reply = {
        role: 'assistant',
        content: data.reply || '⚠️ No reply received.',
      };
      setMessages((prev) => [...prev, reply]);
    } catch (err) {
      console.error('Zeta function error:', err);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: '⚠️ Failed to reach Zeta.',
        },
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
    if (!error) router.replace('/');
  };

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500 text-sm">Loading project dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fdf6ee] px-6 py-8 flex flex-col items-center">
      <div className="flex w-full max-w-7xl gap-6">
        {/* Chat Panel */}
        <div className="flex flex-col flex-[3] bg-white shadow border rounded-2xl h-[70vh]">
          <div className="flex items-center justify-between px-6 py-4 border-b">
            <h1 className="text-2xl font-semibold">🧠 {projectName}</h1>
            <button
              onClick={handleLogout}
              className="text-sm px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800"
            >
              Log Out
            </button>
          </div>
          {userEmail && (
  <div className="px-6 pt-3 text-sm text-gray-600">
    <p>
      Signed in as <span className="font-medium">{userEmail}</span>
    </p>
    <p className="mt-1">
      Project ID: <span className="font-mono text-gray-800">{projectId}</span>
    </p>
  </div>
)}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`max-w-[85%] px-4 py-2 rounded-xl text-sm whitespace-pre-line ${
                  msg.role === 'user'
                    ? 'bg-blue-100 text-black ml-auto'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {msg.content}
              </div>
            ))}
            <div ref={scrollRef} />
          </div>
          <div className="border-t px-3 py-3 bg-white flex">
            <input
              type="text"
              className="appearance-none bg-white text-black border border-gray-300 rounded-l-md px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm max-w-2xl"
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

      <div className="w-full max-w-7xl mt-10 text-center text-gray-400 text-sm italic">
        [ Space reserved for insights / charts / widgets ]
      </div>
    </div>
  );
}
