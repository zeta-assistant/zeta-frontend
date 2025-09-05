'use client';

import React from 'react';
import { FileList, SectionCard, type FileDoc } from './common';

export default function GeneratedView({
  docs,
  loading,
  busyUrl,
  onDelete,
  onRefresh,
  onPreview,
}: {
  docs: FileDoc[];
  loading: boolean;
  busyUrl: string | null;
  onDelete: (d: FileDoc) => void;
  onRefresh: () => void;
  onPreview: (d: FileDoc) => void;
}) {
  return (
    <SectionCard
      title="Generated Files"
      subtitle={loading ? 'Loading…' : `${docs.length} item${docs.length === 1 ? '' : 's'}`}
      right={
        <button
          onClick={onRefresh}
          className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
        >
          Refresh
        </button>
      }
    >
      {docs.length === 0 ? (
        <p className="text-cyan-200/90 italic">
          No generated files yet. Zeta will create files here when you request docgen.
        </p>
      ) : (
        <FileList docs={docs} onDelete={onDelete} busyUrl={busyUrl} onPreview={onPreview} />
      )}
    </SectionCard>
  );
}
