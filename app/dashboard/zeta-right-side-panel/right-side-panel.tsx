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
    <aside
      className="
        flex-[2] bg-white text-black rounded-2xl shadow
        flex flex-col overflow-hidden
        h-[calc(100vh-140px)] min-h-0
      "
    >
      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6">
        <CurrentMemoryPanel userEmail={userEmail} projectId={projectId} />
      </div>
    </aside>
  );
}