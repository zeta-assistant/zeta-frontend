'use client';

import CurrentMemoryPanel from '@/components/CurrentMemoryPanel';

type RightSidePanelProps = {
  userEmail: string | null;
  projectId: string;
};

export default function ZetaRightSidePanel({ userEmail, projectId }: RightSidePanelProps) {
  return (
    <aside
      className="
        flex-[2] bg-white text-black rounded-2xl shadow
        h-[calc(100vh-120px)] min-h-0 overflow-hidden
        flex
      "
    >
      {/* CurrentMemoryPanel now manages the 50/50 split internally */}
      <CurrentMemoryPanel userEmail={userEmail} projectId={projectId} />
    </aside>
  );
}
