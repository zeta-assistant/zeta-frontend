'use client';

import { useRouter } from 'next/navigation';
import DashboardDailyTasks from '@/components/ui/DashboardDailyTasks';
import React from 'react';

export type ZetaLeftSidePanelProps = {
  projectId: string;
  recentDocs: { file_name: string; file_url: string }[];
};

const ZetaLeftSidePanel = ({ projectId, recentDocs }: ZetaLeftSidePanelProps) => {
  const router = useRouter();

  return (
    <div className="flex flex-col items-center pt-[230px]">
      {/* 🧠 Zeta’s Thoughts Panel */}
      <div className="w-[270px] h-[180px] bg-indigo-100 text-indigo-900 px-4 py-3 rounded-xl shadow border border-indigo-300 text-sm mb-3 flex flex-col justify-start">
        <p className="font-bold mb-2">🧠 Zeta’s Thoughts</p>
        <p className="text-sm">
          Remember to review last week’s performance and prep early for next week’s tasks.
          Don’t forget: small wins stack up.
        </p>
      </div>

      {/* 📝 Daily Tasks Panel */}
      <div className="w-full max-w-[750px] overflow-hidden">
        <div className="min-h-[250px]">
          <DashboardDailyTasks projectId={projectId} />
        </div>
      </div>

      {/* 📂 Recent Docs */}
      <div className="flex gap-2 mt-4 mb-4">
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
      <div className="flex flex-col items-center mt-4 mb-1">
        <button
          onClick={() => router.push(`/dashboard/${projectId}/documentupload`)}
          className="w-14 h-14 bg-purple-600 hover:bg-purple-700 text-white text-3xl font-bold rounded-full flex items-center justify-center shadow-lg transition-all duration-300"
          title="Upload Document"
        >
          +
        </button>
        <p className="text-white font-bold text-xl tracking-wide mt-1">Document Upload</p>
      </div>
    </div>
  );
};

export default ZetaLeftSidePanel;