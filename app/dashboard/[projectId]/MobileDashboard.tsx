'use client';

import React, { RefObject } from 'react';
import dynamic from 'next/dynamic';
import { MainTab } from '@/types/MainTab';

import DashboardHeader from '../dashboard-header/dashboard-header';
import ChatboardTab from '../dashboard_tabs/ChatboardTab';
import WorkspaceTabs from '../dashboard_tabs/WorkspaceTabs';
import PlannerTabs from '../dashboard_tabs/PlannerTabs';
import IntelligenceTabs from '../dashboard_tabs/IntelligenceTabs';
import FunctionsTabs from '../dashboard_tabs/FunctionsTabs';

import ChatTab from '../dynamic_tab_content/ChatTab';
import DiscussionsPanel from '../dashboard_tabs/dashboard_panels/Discussions/DiscussionsPanel';
import LogsPanel from '../dashboard_tabs/dashboard_panels/Logs/LogsPanel';
const FilesPanel = dynamic(
  () =>
    import('../dashboard_tabs/dashboard_panels/Files/FilesPanel').then(
      (m) => m.default || (m as any)
    ),
  { ssr: false }
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
import ConnectionsPanel from '../dashboard_tabs/dashboard_panels/Connections/ConnectionsPanel';

type Uploaded = { file_name: string; file_url: string };

type Props = {
  projectName: string;
  userEmail: string | null;
  projectId: string;
  threadId: string | null;

  activeMainTab: MainTab;
  setActiveMainTab: React.Dispatch<React.SetStateAction<MainTab>>;

  chatView: 'all' | 'today' | 'pinned';
  setChatView: React.Dispatch<React.SetStateAction<'all' | 'today' | 'pinned'>>;
  chatHidden: boolean;
  setChatHidden: React.Dispatch<React.SetStateAction<boolean>>;

  messages: any[];
  loading: boolean;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  sendMessage: (opts?: { attachments?: Uploaded[] }) => Promise<void>;
  scrollRef: RefObject<HTMLDivElement | null>;
  fontSize: 'sm' | 'base' | 'lg';
  setFontSize: React.Dispatch<React.SetStateAction<'sm' | 'base' | 'lg'>>;

  refreshAll: () => Promise<void>;
  refreshing: boolean;

  recentDocs: Uploaded[];
};

export default function MobileDashboard({
  projectName,
  userEmail,
  projectId,
  threadId,
  activeMainTab,
  setActiveMainTab,
  chatView,
  setChatView,
  chatHidden,
  setChatHidden,
  messages,
  loading,
  input,
  setInput,
  handleKeyDown,
  sendMessage,
  scrollRef,
  fontSize,
  setFontSize,
  refreshAll,
  refreshing,
  recentDocs,
}: Props) {
  // Use small viewport units to avoid iOS chrome issues
  const PANEL_H = '100svh';

  return (
    <div className="md:hidden flex flex-col min-h-screen bg-sky-800 text-white">
      <div
        className="flex flex-col bg-blue-900 border border-blue-800 rounded-none shadow-lg overflow-hidden flex-1"
        style={{ height: PANEL_H }}
      >
        {/* Header */}
        <DashboardHeader
          projectName={projectName}
          userEmail={userEmail}
          projectId={projectId}
          threadId={threadId}
          showAgentMenu={false}
          setShowAgentMenu={() => {}}
          handleLogout={() => {}}
          onRefresh={refreshAll}
          refreshing={refreshing}
        />

        {/* Tabs */}
        <div className="w-full px-2 py-2 border-b border-blue-700">
          <div className="flex gap-2 overflow-x-auto no-scrollbar">
            <ChatboardTab activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
            <WorkspaceTabs activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
            <PlannerTabs activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
            <IntelligenceTabs activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
            <FunctionsTabs activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
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
              setFontSize={setFontSize}
              projectId={projectId}
              onRefresh={refreshAll}
              refreshing={refreshing}
            />
          )}

          {activeMainTab === 'discussions' && <DiscussionsPanel fontSize={fontSize} />}
          {activeMainTab === 'connections' && <ConnectionsPanel projectId={projectId} />}
          {activeMainTab === 'logs' && <LogsPanel fontSize={fontSize} projectId={projectId} />}
          {activeMainTab === 'files' && (
            <FilesPanel recentDocs={recentDocs} fontSize={fontSize} projectId={projectId} />
          )}
          {activeMainTab === 'apis' && <ApisPanel fontSize={fontSize} projectId={projectId} />}
          {activeMainTab === 'calendar' && <CalendarPanel fontSize={fontSize} />}
          {activeMainTab === 'goals' && <GoalsPanel fontSize="base" projectId={projectId} />}
          {activeMainTab === 'notifications' && <NotificationsPanel projectId={projectId} />}
          {activeMainTab === 'tasks' && <TasksPanel fontSize={fontSize} userName="you" />}
          {activeMainTab === 'thoughts' && <ThoughtsPanel projectId={projectId} fontSize={fontSize} />}
          {activeMainTab === 'timeline' && <TimelinePanel projectId={projectId} />}
          {activeMainTab === 'functions' && <FunctionsPanel projectId={projectId} fontSize={fontSize} />}
          {activeMainTab === 'newfunction' && <NewFunctionPanel projectId={projectId} fontSize={fontSize} />}
          {activeMainTab === 'workshop' && <WorkshopPanel projectId={projectId} fontSize="base" />}
        </div>
      </div>
    </div>
  );
}
