'use client';

import { useRouter } from 'next/navigation';
import CurrentMemoryPanel from '@/components/CurrentMemoryPanel';

type RightSidePanelProps = {
  userEmail: string | null;
  projectId: string;
};


export default function ZetaRightSidePanel({ userEmail, projectId }: RightSidePanelProps) {
  const router = useRouter();

  return (
    <aside className="flex-[2] bg-white text-black rounded-2xl shadow h-[80vh] min-h-[850px] flex flex-col overflow-hidden">
      
      {/* 🧠 Scrollable Memory Panel */}
      <div className="flex-1 overflow-y-auto p-6">
        <CurrentMemoryPanel userEmail={userEmail} projectId={projectId} />
      </div>

      {/* 🧰 Fixed Bottom Utilities */}
      <div className="px-6 py-4 space-y-4 border-t border-indigo-300 bg-white">
        
        {/* 🔧 Custom Build Function */}
        <div className="w-full bg-indigo-100 border border-indigo-300 rounded-2xl px-4 py-2 shadow-md flex justify-between items-center">
          <div>
            <h2 className="text-indigo-900 font-semibold text-sm">Custom Build Function</h2>
            <p className="text-xs text-indigo-700 mt-0.5">Build a custom function Zeta can use</p>
          </div>
          <button
            onClick={() => router.push(`/dashboard/${projectId}/custombuild`)}
            className="w-8 h-8 bg-purple-600 hover:bg-purple-700 text-white text-lg rounded-md flex items-center justify-center shadow"
            title="Create Custom Function"
          >
            🛠️
          </button>
        </div>

        {/* 🔗 API Connections */}
        <div className="w-full bg-gradient-to-r from-blue-600 via-cyan-600 to-teal-500 rounded-2xl px-4 py-2 shadow-md flex flex-col justify-center">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-indigo-900 flex items-center justify-center text-white text-sm">
              🔗
            </div>
            <span className="text-white font-semibold text-sm tracking-wide">API Connections</span>
          </div>
          <div className="mt-2 flex justify-center gap-2">
            <img src="/icons/sheets.png" className="w-5 h-5" alt="Sheets" />
            <img src="/icons/outlook.png" className="w-5 h-5" alt="Outlook" />
            <img src="/icons/chrome.png" className="w-5 h-5" alt="Chrome" />
            <img src="/icons/word.png" className="w-5 h-5" alt="Word" />
          </div>
        </div>

      </div>
    </aside>
  );
}