'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

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
import TimelinePanel from '../dashboard_tabs/dashboard_panels/Timeline/TimelinePanel';

import ThoughtButton from '../dashboard_buttons/thought_button/thought_button';
import MessageButton from '../dashboard_buttons/message_button/message_button';
import SettingsButton from '../dashboard_buttons/settings_button/settings_button';
import RefreshButton from '../dashboard_buttons/refresh_button/refresh_button';
import UploadButton from '../dashboard_buttons/upload_button/upload_button';

type Uploaded = { file_name: string; file_url: string };

export default function DashboardPage() {
  const [messages, setMessages] = useState<any[]>([]);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [projectName, setProjectName] = useState('Loading...');
  const [assistantId, setAssistantId] = useState<string | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [recentDocs, setRecentDocs] = useState<{ file_name: string; file_url: string }[]>([]);
  const [chatView, setChatView] = useState<'all' | 'today' | 'pinned'>('today');
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

  const [userName, setUserName] = useState<string>('you');

  const [activeMainTab, setActiveMainTab] = useState<
    | 'chat'
    | 'discussions'
    | 'logs'
    | 'files'
    | 'calendar'
    | 'functions'
    | 'goals'
    | 'thoughts'
    | 'tasks'
    | 'timeline'
    | 'notifications'
    | 'newfunction'
    | 'workshop'
    | 'apis'
  >('chat');
  const [selectedModelId, setSelectedModelId] = useState('gpt-4o');
  const [chatHidden, setChatHidden] = useState(false);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('sm');
  const [showUpload, setShowUpload] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const hasStartedRef = useRef(false);

  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;
  const isImage = (name: string) => /\.(png|jpe?g|webp|gif)$/i.test(name);

  const buildFilesMarkdown = (atts: Uploaded[]) => {
    const lines: string[] = ['📎 Files attached:'];
    for (const a of atts) {
      if (isImage(a.file_name)) {
        // inline preview
        lines.push(`![${a.file_name}](${a.file_url})`);
      } else {
        // clickable link
        lines.push(`- [${a.file_name}](${a.file_url})`);
      }
    }
    return lines.join('\n');
  };

  useEffect(() => {
    if (!projectId || hasStartedRef.current) return;
    hasStartedRef.current = true;
    checkSessionAndProject();
  }, [projectId]);

  const checkSessionAndProject = async () => {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();
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

    const formatted =
      history?.map((m) => ({
        role: m.role,
        content: m.message,
        timestamp: new Date(m.timestamp).getTime(),
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
          setMessages([
            { role: 'assistant', content: '⚠️ Zeta failed to respond. Try typing something to get started.' },
          ]);
        }
      }, 3000);
    }

    await fetchRecentDocs();
  };

  const fetchRecentDocs = async () => {
    const { data } = await supabase
      .from('documents')
      .select('file_name, file_url')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (data) setRecentDocs(data);
  };

  // NOTE: now accepts optional attachments and forwards them to /api/chat
  const sendMessage = async (opts?: { attachments?: Uploaded[] }) => {
    if (!projectId) return;

    const attachments = opts?.attachments ?? [];
    const hasText = !!input.trim();
    const hasFiles = attachments.length > 0;
    if (!hasText && !hasFiles) return;

    setSendingMessage(true);

    const controller = new AbortController();
    let didTimeout = false;
    const timeoutId = setTimeout(() => {
      didTimeout = true;
      controller.abort();
      setSendingMessage(false);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '⚠️ Request timed out. Please try again.' },
      ]);
    }, 90_000);

    // local bubbles for immediate UX
    const sentText = input;
    if (hasText) {
      setMessages((prev) => [...prev, { role: 'user', content: sentText, timestamp: Date.now() }]);
    }
    if (hasFiles) {
      const filesMsg = buildFilesMarkdown(attachments);
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: filesMsg, timestamp: Date.now() },
      ]);
    }
    setInput('');

    try {
      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();
      if (error || !session?.access_token || !session?.user?.id) {
        clearTimeout(timeoutId);
        setSendingMessage(false);
        setMessages((prev) => [...prev, { role: 'assistant', content: '❌ Not logged in properly.' }]);
        return;
      }

      const user_id = session.user.id;

      // Persist user text (if any)
      if (hasText) {
        await supabase.from('zeta_conversation_log').insert({
          user_id,
          project_id: projectId,
          role: 'user',
          message: sentText,
          timestamp: new Date().toISOString(),
        });
      }

      // NEW: persist file note so it shows after refresh
      if (hasFiles) {
        const filesMsg = buildFilesMarkdown(attachments);
        await supabase.from('zeta_conversation_log').insert({
          user_id,
          project_id: projectId,
          role: 'user',
          message: filesMsg, // markdown with ![img](url) so it renders inline later
          timestamp: new Date().toISOString(),
        });
      }

      // Call your API (still forwards attachments so Zeta can analyze them)
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: hasText ? sentText : '',
          modelId: selectedModelId,
          attachments, // <-- URLs for the API
        }),
        signal: controller.signal,
      });

      if (!res.ok) throw new Error(`API error: ${res.statusText}`);

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

      setMessages((prev) => [...prev, { role: 'assistant', content: assistantReply }]);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (didTimeout && err.name === 'AbortError') return;
      console.error('❌ Message error:', err);
      setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ Failed to send message.' }]);
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

  const refreshAll = async () => {
    if (!projectId) return;
    setRefreshing(true);
    try {
      const { data: history } = await supabase
        .from('zeta_conversation_log')
        .select('role, message, timestamp')
        .eq('project_id', projectId)
        .order('timestamp', { ascending: true });

      const formatted =
        history?.map((m) => ({
          role: m.role,
          content: m.message,
          timestamp: new Date(m.timestamp).getTime(),
        })) || [];
      setMessages(formatted);

      const { data: docs } = await supabase
        .from('documents')
        .select('file_name, file_url')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (docs) setRecentDocs(docs);

      setRefreshNonce((n) => n + 1);
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="min-h-screen bg-blue-950 text-white px-6 py-8 flex flex-col items-center">
      <div className="flex w-full max-w-[1440px] gap-4 justify-start px-2 items-stretch">
        {/* Left Sidebar */}
        <div className="relative w-[350px] shrink-0 px-3 py-2">
          <img
            src={sendingMessage ? '/zeta-thinking.svg' : '/zeta-avatar.svg'}
            alt={sendingMessage ? 'Zeta Thinking' : 'Zeta Mascot'}
            className="w-[250px] absolute top-0 left-1/2 -translate-x-1/2"
          />

          <div className="absolute top-4 left-[300px] z-30 flex flex-col gap-2 items-center">
            <SettingsButton
              projectId={String(projectId)}
              selectedModelId={selectedModelId}
              setSelectedModelId={setSelectedModelId}
            />
            <ThoughtButton projectId={projectId} />
            <MessageButton projectId={projectId} />
            {/* ✅ Upload button (no onOpen prop) */}
            <UploadButton
              projectId={projectId}
              onUploaded={async () => {
                await fetchRecentDocs();
                setRefreshNonce((n) => n + 1);
              }}
            />
          </div>

          <ZetaLeftSidePanel
            key={`left-${refreshNonce}`}
            projectId={projectId}
          />
        </div>

        {/* Main panel */}
        <div className="flex flex-col flex-[4] bg-blue-900 border border-blue-800 rounded-2xl shadow-lg h-[calc(100vh-140px)] min-h-0 overflow-hidden">
          <DashboardHeader
            projectName={projectName}
            userEmail={userEmail}
            projectId={projectId}
            threadId={threadId}
            showAgentMenu={showAgentMenu}
            setShowAgentMenu={setShowAgentMenu}
            handleLogout={handleLogout}
            onRefresh={refreshAll}       // ✅ use your real refresh fn
            refreshing={refreshing}      // ✅ optional loading flag
          />

          <div className="w-full px-6 mt-4 border-b border-blue-700 relative z-30">
            <div className="flex gap-4 flex-wrap">
              <ChatboardTab activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
              <WorkspaceTabs activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
              <PlannerTabs activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
              <IntelligenceTabs activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
              <FunctionsTabs activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
            </div>
          </div>

          {activeMainTab === 'chat' && (
            <ChatTab
              key={`chat-${refreshNonce}`}
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
              setFontSize={setFontSize}
              projectId={projectId}
              onRefresh={refreshAll}
              refreshing={refreshing}
            />
          )}

          {activeMainTab === 'discussions' && (
            <DiscussionsPanel key={`discussions-${refreshNonce}`} fontSize={fontSize} />
          )}
          {activeMainTab === 'logs' && <LogsPanel key="Logs" fontSize={fontSize} projectId={projectId} />}
          {activeMainTab === 'files' && (
            <FilesPanel
              key={`files-${refreshNonce}`}
              recentDocs={recentDocs}
              fontSize={fontSize}
            />
          )}

          {activeMainTab === 'apis' && (
            <ApisPanel
              key={`apis-${refreshNonce}`}
              fontSize={fontSize}
              projectId={projectId}
            />
          )}
          {activeMainTab === 'calendar' && (
            <CalendarPanel key={`calendar-${refreshNonce}`} fontSize={fontSize} />
          )}
          {activeMainTab === 'goals' && (
            <GoalsPanel key={`goals-${refreshNonce}`} fontSize="base" projectId={projectId} />
          )}
          {activeMainTab === 'notifications' && (
            <NotificationsPanel
              key={`notifications-${refreshNonce}`}
              projectId={projectId}
            />
          )}
          {activeMainTab === 'tasks' && (
            <TasksPanel
              key={`tasks-${refreshNonce}`}
              fontSize={fontSize}
              userName={userName}
            />
          )}
          {activeMainTab === 'thoughts' && (
            <ThoughtsPanel key={`thoughts-${refreshNonce}`} projectId={projectId} fontSize={fontSize} />
          )}
          {activeMainTab === 'timeline' && (
  <TimelinePanel key={`timeline-${refreshNonce}`} projectId={projectId} />
)}
          {activeMainTab === 'functions' && (
            <FunctionsPanel key={`functions-${refreshNonce}`} projectId={projectId} fontSize={fontSize} />
          )}
          {activeMainTab === 'newfunction' && (
            <NewFunctionPanel key={`newfunction-${refreshNonce}`} projectId={projectId} fontSize={fontSize} />
          )}
          {activeMainTab === 'workshop' && (
            <WorkshopPanel key={`workshop-${refreshNonce}`} projectId={projectId} fontSize="base" />
          )}
        </div>

        <ZetaRightSidePanel key={`right-${refreshNonce}`} userEmail={userEmail} projectId={projectId} />
      </div>
    </div>
  );
}
