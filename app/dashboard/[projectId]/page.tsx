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
  const [projectName, setProjectName] = useState('Loading...');
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  useEffect(() => {
    const checkSessionAndProject = async () => {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || !session?.user?.email) return router.push('/login');

      setUserEmail(session.user.email);

      const { data: project, error: projectError } = await supabase
        .from('user_projects')
        .select('name, user_id, assistant_id')
        .eq('id', projectId)
        .single();

      if (projectError || !project || project.user_id !== session.user.id) {
        router.push('/projects');
        return;
      }

      setProjectName(project.name);
      setAssistantId(project.assistant_id);

      const { data: history } = await supabase
        .from('zeta_conversation_log')
        .select('role, message, timestamp')
        .eq('project_id', projectId)
        .order('timestamp', { ascending: true });

      if (history) {
        setMessages(history.map((m) => ({ role: m.role, content: m.message })));
      }

      setSessionLoading(false);
    };

    checkSessionAndProject();
  }, [projectId]);

  const sendMessage = async () => {
    if (!input.trim() || !assistantId || !projectId) return;

    const userMessage = { role: 'user', content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user_id = session?.user?.id;

      await supabase.from('zeta_conversation_log').insert({
        project_id: projectId,
        role: 'user',
        message: input,
        user_id,
      });

      const res = await fetch('https://inprydzukperccgtxgvx.functions.supabase.co/functions/v1/chatwithzeta', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`, // 🛡️ Type-safe
        },
        body: JSON.stringify({ message: input, projectId, projectName, userEmail, assistantId }),
      });

      const data = await res.json();
      const replyText = data.reply || '⚠️ No reply received.';
      const assistantMessage = { role: 'assistant', content: replyText };
      setMessages((prev) => [...prev, assistantMessage]);

      await supabase.from('zeta_conversation_log').insert({
        project_id: projectId,
        role: 'assistant',
        message: replyText,
        user_id,
      });

    } catch (err) {
      console.error('❌ sendMessage() failed:', err);
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ Failed to reach Zeta.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') sendMessage();
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.replace('/');
  };

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-blue-950 text-white">
        <p className="text-sm">Loading project dashboard...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-blue-950 text-white px-6 py-8 flex flex-col items-center">
      <div className="flex w-full max-w-7xl gap-6">
        {/* Chat Section */}
        <div className="flex flex-col flex-[3] bg-blue-900 border border-blue-800 rounded-2xl shadow-lg h-[70vh]">
          <div className="flex justify-between items-center px-6 py-4 border-b border-blue-700">
            <h1 className="text-2xl font-bold flex items-center gap-3">
              🧠 {projectName}
              <div className="flex gap-2 ml-4">
                <button
                  onClick={() => router.push('/projects')}
                  className="text-xs bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded-md"
                >
                  Projects
                </button>
                <button
                  onClick={handleLogout}
                  className="text-xs bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded-md"
                >
                  Log Out
                </button>
              </div>
            </h1>
          </div>

          {userEmail && (
            <div className="px-6 pt-2 text-sm text-gray-300">
              <p>Signed in as <span className="font-medium">{userEmail}</span></p>
              <p>Project ID: <span className="font-mono">{projectId}</span></p>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`max-w-[85%] px-4 py-2 rounded-xl text-sm whitespace-pre-line ${
                  msg.role === 'user' ? 'bg-purple-300 text-black ml-auto' : 'bg-blue-800 text-white'
                }`}
              >
                {msg.content}
              </div>
            ))}
            <div ref={scrollRef} />
          </div>

          <div className="border-t border-blue-700 bg-blue-900 px-4 py-3 flex">
            <input
              type="text"
              className="bg-white text-black border border-gray-300 rounded-l-md px-4 py-2 focus:outline-none text-sm w-full max-w-xl"
              placeholder="Ask Zeta something..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
            />
            <button
              onClick={sendMessage}
              disabled={loading}
              className="bg-purple-500 hover:bg-purple-600 text-white px-4 rounded-r-md text-sm"
            >
              {loading ? '...' : 'Send'}
            </button>
          </div>
        </div>

        {/* Memory Panel */}
        <aside className="flex-[1] bg-white text-black rounded-2xl p-6 shadow h-[70vh] overflow-y-auto">
          <CurrentMemoryPanel />
        </aside>
      </div>

      <div className="w-full max-w-7xl mt-10 text-center text-gray-300 text-sm italic">
        [ Space reserved for insights / charts / widgets ]
      </div>
    </div>
  );
}