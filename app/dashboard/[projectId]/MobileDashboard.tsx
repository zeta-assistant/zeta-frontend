'use client';

import React, { RefObject } from 'react';
import dynamic from 'next/dynamic';
import { MainTab } from '@/types/MainTab';

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
  projectId,
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
  return (
    <div className="md:hidden min-h-[100svh] w-full bg-sky-800 text-white">
      <div
        className="flex flex-col w-full h-[100svh] bg-blue-900 border border-blue-800 shadow-lg overflow-visible"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* ==== Compact Mobile Header ==== */}
        <div className="sticky top-0 z-[200] bg-blue-900 border-b border-blue-800 isolate pt-[env(safe-area-inset-top)]">
          <div className="flex items-center gap-3 px-3 py-2">
            <img
              src="/zeta-avatar.svg"
              alt="Zeta"
              className="h-7 w-7 rounded-full shrink-0"
            />
            <div className="font-semibold truncate">{projectName}</div>
            <div className="ml-auto text-xs opacity-70">
              <button
                onClick={refreshAll}
                disabled={refreshing}
                className="px-2 py-1 rounded-md bg-blue-800 border border-blue-700"
              >
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </button>
            </div>
          </div>

          {/* ==== Main Tabs (Equal Width) ==== */}
          <div className="px-2 pb-2">
            <div
              className="
                grid grid-cols-5 gap-2
                [&_button]:w-full [&_button]:justify-center [&_button]:px-2
                [&_button]:min-w-0 [&_*]:text-[13px] [&_*]:leading-5
              "
            >
              <div className="min-w-0">
                <ChatboardTab activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
              </div>
              <div className="min-w-0">
                <WorkspaceTabs activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
              </div>
              <div className="min-w-0">
                <PlannerTabs activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
              </div>
              <div className="min-w-0">
                <IntelligenceTabs activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
              </div>
              <div className="min-w-0">
                <FunctionsTabs activeMainTab={activeMainTab} setActiveMainTab={setActiveMainTab} />
              </div>
            </div>
          </div>
        </div>

        {/* ==== Scrollable Content ==== */}
        <div className="relative z-10 flex-1 min-h-0 overflow-y-auto">
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
