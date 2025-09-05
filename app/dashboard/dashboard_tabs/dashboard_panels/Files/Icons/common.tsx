'use client';

import React from 'react';

/* ---------- Shared types ---------- */
export type FileDoc = {
  file_url: string;
  file_name: string;
  created_at?: string | null;
  created_by?: 'user' | 'zeta' | null;
};

/* ---------- Tiny helpers ---------- */
export function fromNow(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleString();
}

/* ---------- Reusable UI bits ---------- */
export function CreatorBadge({ who }: { who?: 'user' | 'zeta' | null }) {
  const label = who === 'zeta' ? 'Zeta' : who === 'user' ? 'User' : 'Unknown';
  const c =
    who === 'zeta'
      ? 'bg-emerald-600/20 text-emerald-200 border-emerald-500/40'
      : who === 'user'
      ? 'bg-sky-600/20 text-sky-200 border-sky-500/40'
      : 'bg-slate-600/20 text-slate-200 border-slate-500/40';
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${c}`}>{label}</span>;
}

export function SectionCard({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-cyan-50 font-medium">{title}</div>
          {subtitle && <div className="text-[12px] text-cyan-200/90">{subtitle}</div>}
        </div>
        {right}
      </div>
      <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/60 p-4">{children}</div>
    </div>
  );
}

export function FileList({
  docs,
  onDelete,
  busyUrl,
  onPreview,
}: {
  docs: FileDoc[];
  onDelete: (d: FileDoc) => void;
  busyUrl: string | null;
  onPreview?: (d: FileDoc) => void;
}) {
  return (
    <ul className="space-y-3">
      {docs.map((doc) => (
        <li
          key={doc.file_url || doc.file_name}
          className="group flex items-center justify-between gap-3 rounded-lg border border-cyan-500/40 bg-cyan-900/40 hover:bg-cyan-900/60 p-3 transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl">📄</span>
            <div className="min-w-0">
              <div className="text-cyan-50 font-medium truncate">{doc.file_name}</div>
              <div className="text-[11px] text-cyan-200/80 flex items-center gap-2">
                <CreatorBadge who={doc.created_by ?? null} />
                {doc.created_at ? (
                  <span title={new Date(doc.created_at).toLocaleString()}>{fromNow(doc.created_at)}</span>
                ) : (
                  <span className="opacity-70">time unknown</span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {onPreview && (
              <button
                onClick={() => onPreview(doc)}
                className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
              >
                Preview
              </button>
            )}
            {doc.file_url ? (
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-200 hover:text-white hover:underline text-xs"
              >
                Open ↗
              </a>
            ) : null}

            <button
              onClick={() => onDelete(doc)}
              disabled={busyUrl === doc.file_url}
              className={`text-xs px-2 py-1 rounded-md border transition ${
                busyUrl === doc.file_url
                  ? 'bg-gray-300 text-gray-600 border-gray-300 cursor-not-allowed'
                  : 'bg-rose-600/90 hover:bg-rose-600 text-white border-rose-700'
              }`}
              title="Delete file"
            >
              {busyUrl === doc.file_url ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Optional default aggregate to prevent undefined if someone default-imports */
const UI = { SectionCard, FileList, CreatorBadge };
export default UI;
