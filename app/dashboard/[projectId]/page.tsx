'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabaseClient';
import { MainTab } from '@/types/MainTab';

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

// ✅ Dynamic import of FilesPanel
const FilesPanel = dynamic(
  () =>
    import('../dashboard_tabs/dashboard_panels/Files/FilesPanel').then(
      (m) => m.default || (m as any)
    ),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-[320px] text-sm text-blue-200">
        Loading Files…
      </div>
    ),
  }
);

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

// ✅ Static import of default export
import ConnectionsPanel from '../dashboard_tabs/dashboard_panels/Connections/ConnectionsPanel';

import ThoughtButton from '../dashboard_buttons/thought_button/thought_button';
import MessageButton from '../dashboard_buttons/message_button/message_button';
import SettingsButton from '../dashboard_buttons/settings_button/settings_button';
import UploadButton from '../dashboard_buttons/upload_button/upload_button';

// ✅ Mobile-only compact dashboard
import MobileDashboard from './MobileDashboard';

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
  const [recentDocs, setRecentDocs] = useState<Uploaded[]>([]);
  const [chatView, setChatView] = useState<'all' | 'today' | 'pinned'>('today');
  const [showAgentMenu, setShowAgentMenu] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

  const [userName, setUserName] = useState<string>('you');

  const [activeMainTab, setActiveMainTab] = useState<MainTab>('chat');

  const [selectedModelId, setSelectedModelId] = useState('gpt-4o');
  const [chatHidden, setChatHidden] = useState(false);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg'>('sm');
  const [refreshNonce, setRefreshNonce] = useState(0);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hasStartedRef = useRef(false);

  const router = useRouter();
  const params = useParams();
  const projectId = params.projectId as string;

  // 🔹 which template this project is using (slug from zeta_templates)
  const [templateSlug, setTemplateSlug] = useState<string | null>(null);

  const isImage = (name: string) => /\.(png|jpe?g|webp|gif)$/i.test(name);

  const buildFilesMarkdown = (atts: Uploaded[]) => {
    const lines: string[] = ['📎 Files attached:'];
    for (const a of atts) {
      if (isImage(a.file_name)) lines.push(`![${a.file_name}](${a.file_url})`);
      else lines.push(`- [${a.file_name}](${a.file_url})`);
    }
    return lines.join('\n');
  };

  useEffect(() => {
    if (!projectId || hasStartedRef.current) return;
    hasStartedRef.current = true;
    checkSessionAndProject();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      .select('name, user_id, assistant_id, thread_id, template_id')
      .eq('id', projectId)
      .single();

    if (projectError || !project || project.user_id !== session.user.id) {
      router.push('/projects');
      return;
    }

    setProjectName(project.name);
    setAssistantId(project.assistant_id);
    setThreadId(project.thread_id ?? null);

    // 🔹 get slug for this template (zeta-chef, zeta-writer, etc.)
    if (project.template_id) {
      const { data: template, error: templateError } = await supabase
        .from('zeta_templates')
        .select('slug')
        .eq('id', project.template_id)
        .single();

      if (!templateError && template?.slug) {
        setTemplateSlug(template.slug);
      }
    }

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
          setMessages(
            updated.map((m) => ({ role: m.role, content: m.message }))
          );
        } else {
          setMessages([
            {
              role: 'assistant',
              content:
                '⚠️ Zeta failed to respond. Try typing something to get started.',
            },
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

    const sentText = input;
    if (hasText) {
      setMessages((prev) => [
        ...prev,
        { role: 'user', content: sentText, timestamp: Date.now() },
      ]);
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
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: '❌ Not logged in properly.' },
        ]);
        return;
      }

      const user_id = session.user.id;

      if (hasText) {
        await supabase.from('zeta_conversation_log').insert({
          user_id,
          project_id: projectId,
          role: 'user',
          message: sentText,
          timestamp: new Date().toISOString(),
        });
      }

      if (hasFiles) {
        const filesMsg = buildFilesMarkdown(attachments);
        await supabase.from('zeta_conversation_log').insert({
          user_id,
          project_id: projectId,
          role: 'user',
          message: filesMsg,
          timestamp: new Date().toISOString(),
        });
      }

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          message: hasText ? sentText : '',
          modelId: selectedModelId,
          attachments,
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

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: assistantReply },
      ]);
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (didTimeout && err.name === 'AbortError') return;
      console.error('❌ Message error:', err);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '⚠️ Failed to send message.' },
      ]);
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

  const PANEL_H = 'calc(100vh - 110px)';

  // 🔹 decide thinking image: default, chef, writer
  const getThinkingSrc = () => {
    if (templateSlug === 'zeta-chef') return '/templates/zeta-chef-thinking.png';
    if (templateSlug === 'zeta-writer')
      return '/templates/zeta-writer-thinking.png';
    return '/zeta-thinking.svg';
  };

  // 🔹 decide idle image based on template
  const getIdleSrc = () => {
    if (templateSlug === 'zeta-chef') return '/templates/zeta-chef.png';
    if (templateSlug === 'zeta-writer') return '/templates/zeta-writer.png';
    if (templateSlug) return `/templates/${templateSlug}.png`; // zeta-learn, zeta-quant, etc.
    return '/templates/zeta.png'; // fallback (fixes /zeta.png 404)
  };

  return (
    <>
      {/* MOBILE: header + tabs + center panel only */}
      <div className="md:hidden">
        <MobileDashboard
          projectName={projectName}
          userEmail={userEmail}
          projectId={projectId}
          threadId={threadId}
          activeMainTab={activeMainTab}
          setActiveMainTab={setActiveMainTab}
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
          refreshAll={refreshAll}
          refreshing={refreshing}
          recentDocs={recentDocs}
        />
      </div>

      {/* DESKTOP/TABLET: full layout with side panels & floating buttons */}
      <div className="hidden md:flex">
        {/* ⬇️ FULL-WIDTH PAGE WRAPPER (no centering / no max-w) */}
        <div className="min-h-screen w-full bg-sky-800 text-white px-3 md:px-4 lg:px-6 py-6">
          {/* ⬇️ ROW LAYOUT, LEFT-ALIGNED, NO MAX-W */}
          <div className="flex w-full gap-4 justify-start items-stretch">
            {/* Left Sidebar */}
            <div
              className="relative w-[350px] shrink-0 px-3 py-2 flex flex-col"
              style={{ height: PANEL_H }}
            >
              <img
                src={sendingMessage ? getThinkingSrc() : getIdleSrc()}
                alt="Zeta Avatar"
                className="w-[250px] absolute top-0 left-1/2 -translate-x-1/2 mix-blend-multiply"
                style={{ background: 'none' }}
              />

              <div className="absolute top-4 left-[300px] z-30 flex flex-col gap-2 items-center">
  <SettingsButton
    projectId={String(projectId)}
    selectedModelId={selectedModelId}
    setSelectedModelId={setSelectedModelId}
    avatarSrc={getIdleSrc()}          // already used for the dashboard avatar
    templateSlug={templateSlug ?? undefined}  // 🔹 NEW: pass slug through
  />
  <ThoughtButton projectId={projectId} />
  <MessageButton projectId={projectId} />
  <UploadButton
    projectId={projectId}
    onUploaded={async () => {
      await fetchRecentDocs();
      setRefreshNonce((n) => n + 1);
    }}
  />
</div>



              <ZetaLeftSidePanel key={`left-${refreshNonce}`} projectId={projectId} />
            </div>

            {/* Main panel */}
            <div
              className="flex flex-col flex-[4] bg-blue-900 border border-blue-800 rounded-2xl shadow-lg min-h-0 overflow-hidden"
              style={{ height: PANEL_H }}
            >
              <DashboardHeader
                projectName={projectName}
                userEmail={userEmail}
                projectId={projectId}
                threadId={threadId}
                showAgentMenu={showAgentMenu}
                setShowAgentMenu={setShowAgentMenu}
                handleLogout={handleLogout}
                onRefresh={refreshAll}
                refreshing={refreshing}
              />

              {/* === Equal-width tabs on desktop === */}
              <div className="w-full px-6 mt-4 border-b border-blue-700 relative z-30">
                <div
                  className="
                    grid grid-cols-5 gap-4
                    [&_button]:w-full [&_button]:justify-center [&_button]:px-4
                    [&_button]:whitespace-nowrap
                  "
                >
                  <div className="min-w-0">
                    <ChatboardTab
                      activeMainTab={activeMainTab}
                      setActiveMainTab={setActiveMainTab}
                    />
                  </div>
                  <div className="min-w-0">
                    <WorkspaceTabs
                      activeMainTab={activeMainTab}
                      setActiveMainTab={setActiveMainTab}
                    />
                  </div>
                  <div className="min-w-0">
                    <PlannerTabs
                      activeMainTab={activeMainTab}
                      setActiveMainTab={setActiveMainTab}
                    />
                  </div>
                  <div className="min-w-0">
                    <IntelligenceTabs
                      activeMainTab={activeMainTab}
                      setActiveMainTab={setActiveMainTab}
                    />
                  </div>
                  <div className="min-w-0">
                    <FunctionsTabs
                      activeMainTab={activeMainTab}
                      setActiveMainTab={setActiveMainTab}
                    />
                  </div>
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
                <DiscussionsPanel
                  key={`discussions-${refreshNonce}`}
                  fontSize={fontSize}
                />
              )}

              {/* 🌐 Connections */}
              {activeMainTab === 'connections' && (
                <ConnectionsPanel
                  key={`connections-${refreshNonce}`}
                  projectId={projectId}
                />
              )}

              {activeMainTab === 'logs' && (
                <LogsPanel
                  key="Logs"
                  fontSize={fontSize}
                  projectId={projectId}
                />
              )}

              {activeMainTab === 'files' && (
                <FilesPanel
                  key={`files-${refreshNonce}`}
                  recentDocs={recentDocs}
                  fontSize={fontSize}
                  projectId={projectId}
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
                <CalendarPanel
                  key={`calendar-${refreshNonce}`}
                  fontSize={fontSize}
                />
              )}

              {activeMainTab === 'goals' && (
                <GoalsPanel
                  key={`goals-${refreshNonce}`}
                  fontSize="base"
                  projectId={projectId}
                />
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
                <ThoughtsPanel
                  key={`thoughts-${refreshNonce}`}
                  projectId={projectId}
                  fontSize={fontSize}
                />
              )}

              {activeMainTab === 'timeline' && (
                <TimelinePanel
                  key={`timeline-${refreshNonce}`}
                  projectId={projectId}
                />
              )}

              {activeMainTab === 'functions' && (
                <FunctionsPanel
                  key={`functions-${refreshNonce}`}
                  projectId={projectId}
                  fontSize={fontSize}
                />
              )}

              {activeMainTab === 'newfunction' && (
                <NewFunctionPanel
                  key={`newfunction-${refreshNonce}`}
                  projectId={projectId}
                  fontSize={fontSize}
                />
              )}

              {activeMainTab === 'workshop' && (
                <WorkshopPanel
                  key={`workshop-${refreshNonce}`}
                  projectId={projectId}
                  fontSize="base"
                />
              )}
            </div>

            {/* Right sidebar */}
            <div className="w-[380px] shrink-0" style={{ height: PANEL_H }}>
              <ZetaRightSidePanel
                key={`right-${refreshNonce}`}
                userEmail={userEmail}
                projectId={projectId}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}