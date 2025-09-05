'use client';

import React from 'react';
import { FileList, SectionCard, type FileDoc } from './common';
import UploadButton from '../../../../dashboard_buttons/upload_button/upload_button';

export default function UploadedView({
  projectId,
  docs,
  loading,
  busyUrl,
  onDelete,
  onRefresh,
}: {
  projectId: string;
  docs: FileDoc[];
  loading: boolean;
  busyUrl: string | null;
  onDelete: (d: FileDoc) => void;
  onRefresh: () => void;
}) {
  return (
    <SectionCard
      title="Uploaded Files"
      subtitle={loading ? 'Loading…' : `${docs.length} item${docs.length === 1 ? '' : 's'}`}
      right={
        <div className="flex items-center gap-2">
          <UploadButton
            projectId={projectId}
            onUploaded={onRefresh}
            className="w-9 h-9 text-base"
          />
          <button
            onClick={onRefresh}
            className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
          >
            Refresh
          </button>
        </div>
      }
    >
      {docs.length === 0 ? (
        <p className="text-cyan-200/90 italic">No files uploaded yet.</p>
      ) : (
        <FileList docs={docs} onDelete={onDelete} busyUrl={busyUrl} />
      )}
    </SectionCard>
  );
}
