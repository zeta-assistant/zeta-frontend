  'use client';

  import { useEffect, useState, useRef } from 'react';
  import { useRouter, useParams } from 'next/navigation';
  import { supabase } from '@/lib/supabaseClient';
  import CurrentMemoryPanel from '@/components/CurrentMemoryPanel';
  import Clock from '@/components/Clock';
  import DailyGoalsPanel from '@/components/DailyGoalsPanel';


  export default function DashboardPage() {
    const [messages, setMessages] = useState<any[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [projectName, setProjectName] = useState('Loading...');
    const [assistantId, setAssistantId] = useState<string | null>(null);
    const [sessionLoading, setSessionLoading] = useState(true);
    const [recentDocs, setRecentDocs] = useState<{ file_name: string; file_url: string }[]>([]);
    const scrollRef = useRef<HTMLDivElement>(null);
    const hasStartedRef = useRef(false);
    const router = useRouter();
    const params = useParams();
    const projectId = params.projectId as string;

    useEffect(() => {
      if (!projectId || hasStartedRef.current) return;
      hasStartedRef.current = true;
      checkSessionAndProject();
    }, [projectId]);

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

      const formatted = history?.map((m) => ({ role: m.role, content: m.message })) || [];
      setMessages(formatted);
      setSessionLoading(false);

      if (formatted.length === 0) {
        await fetch('/api/startConversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId }),
        });

        setTimeout(async () => {
          const { data: updated } = await supabase
            .from('zeta_conversation_log')
            .select('role, message, timestamp')
            .eq('project_id', projectId)
            .order('timestamp', { ascending: true });

          if (updated && updated.length > 0) {
            setMessages(updated.map((m) => ({ role: m.role, content: m.message })));
          } else {
            setMessages([{ role: 'assistant', content: '⚠️ Zeta failed to respond. Try typing something to get started.' }]);
          }
        }, 3000);
      }

      await fetchRecentDocs();
    };

    const fetchRecentDocs = async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('file_name, file_url')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (data) setRecentDocs(data);
    };

    const sendMessage = async () => {
      if (!input.trim() || !projectId) return;
      const userMessage = { role: 'user', content: input };
      setMessages((prev) => [...prev, userMessage]);
      setInput('');
      setLoading(true);

      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error || !session?.access_token || !session?.user?.id) {
          setMessages((prev) => [...prev, { role: 'assistant', content: '❌ Not logged in properly.' }]);
          return;
        }

        const user_id = session.user.id;

        await supabase.from('zeta_conversation_log').insert({
          project_id: projectId,
          role: 'user',
          message: input,
          user_id,
        });

        const { data: refreshedProject } = await supabase
          .from('user_projects')
          .select('assistant_id')
          .eq('id', projectId)
          .single();

        const finalAssistantId = refreshedProject?.assistant_id || assistantId;
        setAssistantId(finalAssistantId);

        const res = await fetch('https://inprydzukperccgtxgvx.functions.supabase.co/functions/v1/chatwithzeta', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            message: input,
            projectId,
            projectName,
            userEmail,
            assistantId: finalAssistantId,
          }),
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
    <div className="flex w-full max-w-[1440px] gap-4 justify-start px-2">
      {/* Left Sidebar */}
      <div className="relative w-[350px] shrink-0 px-3 py-2">
        {/* 🧠 Zeta Mascot */}
        <img
          src={loading ? '/zeta-thinking.svg' : '/zeta-avatar.svg'}
          alt={loading ? 'Zeta Thinking' : 'Zeta Mascot'}
          className="w-[250px] absolute top-0 left-1/2 -translate-x-1/2"
        />

        {/* Add top padding to make space for mascot */}
        <div className="flex flex-col items-center pt-[230px]">
          {/* 🧠 Zeta’s Thoughts Panel */}
          <div className="w-[250px] bg-indigo-100 text-indigo-900 px-4 py-3 rounded-xl shadow border border-indigo-300 text-sm mb-3">
            <p className="font-bold mb-1">🧠 Zeta’s Thoughts</p>
            <p>
              Remember to review last week’s performance and prep early for next week’s tasks.
              Don’t forget: small wins stack up.
            </p>
          </div>

          {/* 📝 Daily Goals Panel */}
          <div className="mb-4">
            <DailyGoalsPanel
              zetaTasks={['Process doc tags', 'Post outreach 4PM']}
              userTasks={['Upload notes', 'Add memory summary']}
            />
          </div>

          {/* 📂 Recent Docs */}
          <div className="flex gap-2 mb-4">
            {recentDocs.map((doc, i) => {
              const ext = doc.file_name.split('.').pop()?.toLowerCase();
              const iconMap: Record<string, string> = {
                pdf: '📕', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
                csv: '📈', txt: '📄', png: '🖼️', jpg: '🖼️', jpeg: '🖼️',
                svg: '🎨', json: '🧩', zip: '🗜️', md: '📘', ppt: '📽️', pptx: '📽️',
              };
              const icon = iconMap[ext ?? ''] || '📁';
              const fileUrl = `https://inprydzukperccgtxgvx.supabase.co/storage/v1/object/public/project-docs/${doc.file_url}`;
              return (
                <a
                  key={i}
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  title={doc.file_name}
                  className="w-9 h-9 bg-white text-purple-700 rounded shadow flex items-center justify-center text-xl font-bold hover:scale-110 transition-transform duration-200"
                >
                  {icon}
                </a>
              );
            })}
          </div>

          {/* ➕ Upload Button */}
          <div className="flex flex-col items-center">
            <button
              onClick={() => router.push(`/dashboard/${projectId}/documentupload`)}
              className="bg-purple-600 hover:bg-purple-700 text-white text-5xl font-bold rounded-full w-24 h-24 flex items-center justify-center shadow-2xl transition-all duration-300"
              title="Upload Document"
            >
              +
            </button>
            <p className="text-white text-sm font-semibold mt-1">Document Upload</p>
          </div>
        </div>
      </div>
          {/* 💬 Chat and Header */}
<div className="flex flex-col flex-[4] bg-blue-900 border border-blue-800 rounded-2xl shadow-lg h-[70vh] min-h-[650px]">
  {/* Header */}
  <div className="flex justify-between items-center px-6 py-4 border-b border-blue-700">
    <div className="flex items-center gap-4">
      <img src="/zeta-logo.png" alt="Zeta Logo" className="w-8 h-8 rounded-xl shadow-md" />
      <h1 className="text-xl font-semibold">Zeta Dashboard</h1>
      <Clock />
    </div>
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

  {/* User Info */}
  {userEmail && (
    <div className="px-6 pt-2 text-sm text-gray-300">
      <p>
        Signed in as <span className="font-medium">{userEmail}</span>
      </p>
      <p>
        Project ID: <span className="font-mono">{projectId}</span>
      </p>
    </div>
  )}

  {/* Chat Scroll Area */}
  <div className="flex-1 overflow-y-auto px-6 pt-2 pb-4 space-y-3 mt-2">
    {messages.map((msg, i) => (
      <div
        key={i}
        className={`max-w-[85%] px-4 py-3 rounded-xl text-sm whitespace-pre-line ${
          msg.role === 'user'
            ? 'bg-purple-200 text-purple-900 ml-auto font-medium border border-purple-400 shadow'
            : 'bg-gradient-to-br from-indigo-700 to-purple-700 text-white font-mono shadow-md'
        }`}
      >
        {msg.content}
      </div>
    ))}

    {loading && (
      <div className="max-w-[85%] px-4 py-3 rounded-xl text-sm bg-blue-800 text-white animate-pulse font-mono">
        Zeta is thinking...
      </div>
    )}
    <div ref={scrollRef} />
  </div>

  {/* Chat Input */}
  <div className="border-t border-blue-700 bg-blue-900 px-4 pt-3 pb-5 rounded-b-2xl">
    <div className="flex">
      <input
        type="text"
        className="bg-purple-50 text-purple-900 border-2 border-purple-300 rounded-l-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold text-sm w-full max-w-xl shadow-sm"
        placeholder="Ask Zeta something..."
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      <button
        onClick={sendMessage}
        disabled={loading}
        className="bg-purple-600 hover:bg-purple-700 text-white px-4 rounded-r-xl text-sm font-semibold shadow"
      >
        {loading ? '...' : 'Send'}
      </button>
    </div>
  </div>
</div>

          {/* 📊 Memory Panel */}
          <aside className="flex-[2] bg-white text-black rounded-2xl p-6 shadow h-[70vh] overflow-y-auto">
            <CurrentMemoryPanel />
          </aside>
        </div>

        <div className="w-full max-w-7xl mt-10 text-center text-gray-300 text-sm italic">
          [ Space reserved for insights / charts / widgets ]
        </div>
      </div>
    );
  }