  'use client';
import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import CurrentMemoryPanel from '@/components/CurrentMemoryPanel';
import Clock from '@/components/Clock';
import DailyGoalsPanel from '@/components/DailyTasksPanel';
import { AVAILABLE_MODELS } from '@/lib/models';
import ReactMarkdown from 'react-markdown';
import DashboardDailyTasks from '@/components/ui/DashboardDailyTasks';

import ChatboardTab from '../dashboard_tabs/ChatboardTab';
import WorkspaceTabs from '../dashboard_tabs/WorkspaceTabs';
import PlannerTabs from '../dashboard_tabs/PlannerTabs';
import IntelligenceTabs from '../dashboard_tabs/IntelligenceTabs';
import FunctionsTabs from '../dashboard_tabs/FunctionsTabs';
import ChatTab from '../dynamic_tab_content/ChatTab';

import ZetaLeftSidePanel from '../zeta-left-side-panel/left-side-panel';
import ZetaRightSidePanel from '../zeta-right-side-panel/right-side-panel';
import DashboardHeader from '../dashboard-header/dashboard-header';

import DiscussionsPanel from '../dashboard_tabs/dashboard_panels/Discussions/DiscussionsPanel';
import LogsPanel from '../dashboard_tabs/dashboard_panels/Logs/LogsPanel';
import FilesPanel from '../dashboard_tabs/dashboard_panels/Files/FilesPanel';
import ApisPanel from '../dashboard_tabs/dashboard_panels/APIs/ApisPanel';
import CalendarPanel from '../dashboard_tabs/dashboard_panels/Calendar/CalendarPanel';
import GoalsPanel from '../dashboard_tabs/dashboard_panels/Goals/GoalsPanel';
import NotificationsPanel from '../dashboard_tabs/dashboard_panels/Notifications/NotificationsPanel';
import TasksPanel from '../dashboard_tabs/dashboard_panels/Tasks/TasksPanel';
import ThoughtsPanel from '../dashboard_tabs/dashboard_panels/Thoughts/ThoughtsPanel';
import FunctionsPanel from '../dashboard_tabs/dashboard_panels/Functions/FunctionsPanel';
import NewFunctionPanel from '../dashboard_tabs/dashboard_panels/NewFunction/NewFunctionPanel';
import WorkshopPanel from '../dashboard_tabs/dashboard_panels/Workshop/WorkshopPanel';

export default function DashboardPage() {
  const [messages, setMessages] = useState<any[]>([]);

const [sendingMessage, setSendingMessage] = useState(false);
const [refreshing, setRefreshing] = useState(false);
  const [clearedMessages, setClearedMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('Loading...');
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [recentDocs, setRecentDocs] = useState<{ file_name: string; file_url: string }[]>([]);
  const [chatView, setChatView] = useState<'all' | 'today' | 'pinned'>('all');
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
const [activeMainTab, setActiveMainTab] = useState<
  'chat' | 'discussions' | 'logs' | 'files' | 'calendar' | 'functions' | 'goals' | 'thoughts' | 'tasks' | 'notifications' | 'newfunction' | 'workshop' | 'apis'
>('chat');
  const [selectedModelId, setSelectedModelId] = useState('gpt-4o'); // default
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [chatHidden, setChatHidden] = useState(false);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('sm');

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
        .select('name, user_id, assistant_id, thread_id')
        .eq('id', projectId)
        .single();

      if (projectError || !project || project.user_id !== session.user.id) {
        router.push('/projects');
        return;
      }

      setProjectName(project.name);
      setAssistantId(project.assistant_id);
      setThreadId(project.thread_id ?? null);

      const { data: history } = await supabase
        .from('zeta_conversation_log')
        .select('role, message, timestamp')
        .eq('project_id', projectId)
        .order('timestamp', { ascending: true });

      const formatted = history?.map((m) => ({
  role: m.role,
  content: m.message,
  timestamp: new Date(m.timestamp).getTime(), // ← use DB timestamp
})) || [];
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

  setSendingMessage(true);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
    setSendingMessage(false);
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '⚠️ Request timed out. Please try again.' },
    ]);
  }, 15000);

  const userMessage = {
    role: 'user',
    content: input,
    timestamp: Date.now(),
  };
  setMessages((prev) => [...prev, userMessage]);
  setInput('');

  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error || !session?.access_token || !session?.user?.id) {
      clearTimeout(timeoutId);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '❌ Not logged in properly.' },
      ]);
      setSendingMessage(false);
      return;
    }

    const user_id = session.user.id;

    await supabase.from('zeta_conversation_log').insert({
      user_id,
      project_id: projectId,
      role: 'user',
      message: input,
      timestamp: new Date().toISOString(),
    });

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        message: input,
        modelId: selectedModelId,
      }),
      signal: controller.signal, // <-- attach the abort signal here
    });

    if (!res.ok) {
      throw new Error(`API error: ${res.statusText}`);
    }

    const data = await res.json();

    clearTimeout(timeoutId);

    const assistantReply = data.reply;

    await supabase.from('zeta_conversation_log').insert({
      user_id,
      project_id: projectId,
      role: 'assistant',
      message: assistantReply,
      timestamp: new Date().toISOString(),
    });

    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: assistantReply },
    ]);
  } catch (err: any) {
    clearTimeout(timeoutId);
    console.error('❌ Message error:', err);
    if (err.name === 'AbortError') {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '⚠️ Request was aborted due to timeout.' },
      ]);
    } else {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '⚠️ Failed to send message.' },
      ]);
    }
  } finally {
    setSendingMessage(false);
  }
};

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') sendMessage();
    };

    const handleLogout = async () => {
      await supabase.auth.signOut();
      router.replace('/');
    };



    

   const handleRefresh = async () => {
  if (!projectId) return;
  setRefreshing(true);
  try {
    const { data: history, error } = await supabase
      .from('zeta_conversation_log')
      .select('role, message, timestamp')
      .eq('project_id', projectId)
      .order('timestamp', { ascending: true });

    if (error) {
      console.error('Error refreshing messages:', error);
      setRefreshing(false);
      return;
    }

    const formatted = history?.map((m) => ({
      role: m.role,
      content: m.message,
      timestamp: new Date(m.timestamp).getTime(),
    })) || [];

    setMessages(formatted);
  } catch (err) {
    console.error('Refresh failed:', err);
  } finally {
    setRefreshing(false);
  }
};
   return (
  <div className="min-h-screen bg-blue-950 text-white px-6 py-8 flex flex-col items-center">
    <div className="flex w-full max-w-[1440px] gap-4 justify-start px-2">
      {/* Left Sidebar */}
      <div className="relative w-[350px] shrink-0 px-3 py-2">
        {/* 🧠 Zeta Mascot */}
        <img

  src={sendingMessage || refreshing ? '/zeta-thinking.svg' : '/zeta-avatar.svg'}
  alt={sendingMessage || refreshing ? 'Zeta Thinking' : 'Zeta Mascot'}
  className="w-[250px] absolute top-0 left-1/2 -translate-x-1/2"
        />
        <div className="absolute top-4 left-[300px] z-30 flex flex-col gap-2 items-center">
  {/* ⚙️ Settings Button */}
  <button
    onClick={() => setShowSettingsModal(true)}
    className="text-indigo-900 bg-white hover:bg-yellow-100 border border-yellow-300 rounded-full p-2 shadow-lg text-xl transition"
  title="Settings"
  >
    ⚙️
  </button>

  {/* 💡 Generate Thought Button */}
  <button
  onClick={() => console.log('💡 Generate Thought clicked')}
  className="text-yellow-600 bg-white hover:bg-yellow-100 border border-yellow-300 rounded-full w-11 h-11 text-xl flex items-center justify-center shadow-lg transition"
  title="Generate Thought"
>
  💡
</button>
{/* 🔄 Refresh Button */}
<button
  onClick={handleRefresh}
  disabled={refreshing}
  className={`mt-2 w-11 h-11 text-xl flex items-center justify-center rounded-full border px-0 py-0 shadow-lg transition
    ${refreshing ? 'bg-gray-300 text-gray-600 cursor-not-allowed border-gray-300' : 'text-blue-600 bg-white hover:bg-blue-100 border-blue-300'}`}
  title={refreshing ? "Refreshing..." : "Refresh"}
>
  🔄
</button>
</div>
{/* ✅ Zeta left-side-panel */}
<ZetaLeftSidePanel projectId={projectId} recentDocs={recentDocs} />

</div>
{/* 🧠 Chatboard + Logs + Files Tabs Panel */}
<div className="flex flex-col flex-[4] bg-blue-900 border border-blue-800 rounded-2xl shadow-lg h-[calc(100vh-140px)] min-h-[850px]">

  {/* Modularized Header */}
  <DashboardHeader
    projectName={projectName}
    userEmail={userEmail}
    projectId={projectId}
    threadId={threadId}
    showAgentMenu={showAgentMenu}
    setShowAgentMenu={setShowAgentMenu}
    handleLogout={handleLogout}
  />

  {/* 📁 Grouped Main Tabs */}
<div className="w-full px-6 mt-4 border-b border-blue-700">
  <div className="flex gap-4 flex-wrap">

   
{/* Chatboard (standalone) */}
<ChatboardTab activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />


    {/* Workspace Group */}
<WorkspaceTabs
  activeMainTab={activeMainTab}
  setActiveMainTab={setActiveMainTab}
/>
    {/* Planner Group */}
    <PlannerTabs
  activeMainTab={activeMainTab}
  setActiveMainTab={setActiveMainTab}
/>
  {/* Intelligence Group */}
    <IntelligenceTabs
  activeMainTab={activeMainTab}
  setActiveMainTab={setActiveMainTab}
/>

    {/* Functions Group */}
    <FunctionsTabs
  activeMainTab={activeMainTab}
  setActiveMainTab={setActiveMainTab}
/>

  </div>
</div>

{/* 🔄 Dynamic Tab Content */}
{activeMainTab === 'chat' && (
  <ChatTab
    activeMainTab={activeMainTab}
    chatView={chatView}
    setChatView={setChatView}
    chatHidden={chatHidden}
    setChatHidden={setChatHidden}
    messages={messages}
    loading={loading}
    input={input}
    setInput={setInput}
    handleKeyDown={handleKeyDown}
    sendMessage={sendMessage}
    scrollRef={scrollRef}
    fontSize={fontSize}
    setFontSize={setFontSize} // ✅ only here
  />
)}

{activeMainTab === 'discussions' && <DiscussionsPanel fontSize={fontSize} />}
{activeMainTab === 'logs' && <LogsPanel fontSize={fontSize} />}
{activeMainTab === 'files' && <FilesPanel recentDocs={recentDocs} fontSize={fontSize} />}
{activeMainTab === 'apis' && <ApisPanel fontSize={fontSize} />}
{activeMainTab === 'calendar' && <CalendarPanel fontSize={fontSize} />}
{activeMainTab === 'goals' && <GoalsPanel fontSize={fontSize} />}
{activeMainTab === 'notifications' && <NotificationsPanel fontSize={fontSize} />}
{activeMainTab === 'tasks' && <TasksPanel fontSize={fontSize} />}
{activeMainTab === 'thoughts' && <ThoughtsPanel fontSize={fontSize} />}
{activeMainTab === 'functions' && <FunctionsPanel projectId={projectId} fontSize={fontSize} />}
{activeMainTab === 'newfunction' && <NewFunctionPanel projectId={projectId} fontSize={fontSize} />}
{activeMainTab === 'workshop' && <WorkshopPanel projectId={projectId} fontSize="base" />}


</div>



{/* 📊 Right-Side Panel (Memory, Function Builder, APIs) */}
<ZetaRightSidePanel userEmail={userEmail} projectId={projectId} />
</div> {/* closes main horizontal container */}


{/* ⚙️ Settings Modal */}
{showSettingsModal && (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
    <div className="bg-white rounded-xl shadow-xl p-6 w-[400px] max-w-[90%] text-indigo-900 relative">
      <button
        onClick={() => setShowSettingsModal(false)}
        className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-lg"
        title="Close"
      >
        ✖️
      </button>
      <h2 className="text-lg font-bold mb-3">⚙️ Zeta Settings</h2>
      <div className="mt-4">
        <label className="block text-sm font-semibold mb-1">
          🧠 Choose Intelligence Engine
        </label>
        <select
          value={selectedModelId}
          onChange={(e) => setSelectedModelId(e.target.value)}
          className="w-full border border-indigo-300 rounded-md p-2 text-sm bg-indigo-50 text-indigo-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
        >
          <option value="gpt-4o">OpenAI</option>
          <option value="deepseek-chat">DeepSeek</option>
          <option value="mistral-7b">SLM</option>
        </select>
      </div>
    </div>
  </div>
)}
</div>  
)}