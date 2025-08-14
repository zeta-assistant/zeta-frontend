'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type FileDoc = { file_url: string; file_name: string };

export default function FilesPanel({
  recentDocs,
  fontSize,
}: {
  recentDocs: FileDoc[];
  fontSize: 'sm' | 'base' | 'lg';
}) {
  const [docs, setDocs] = useState<FileDoc[]>(recentDocs);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => setDocs(recentDocs), [recentDocs]);

  const toStoragePath = (urlOrPath: string) => {
    if (!urlOrPath) return '';
    if (urlOrPath.startsWith('http')) {
      const marker = '/object/public/project-docs/';
      const i = urlOrPath.indexOf(marker);
      return i >= 0 ? urlOrPath.slice(i + marker.length) : urlOrPath;
    }
    return urlOrPath;
  };

  const handleDelete = async (doc: FileDoc) => {
    if (!confirm(`Delete "${doc.file_name}"? This can’t be undone.`)) return;
    setBusy(doc.file_url);

    try {
      const path = toStoragePath(doc.file_url);

      if (path) {
        const { error: storageErr } = await supabase.storage
          .from('project-docs')
          .remove([path]);
        if (storageErr) throw storageErr;
      }

      const { error: dbErr } = await supabase
        .from('documents')
        .delete()
        .or(`file_url.eq.${doc.file_url},file_url.eq.${path}`);
      if (dbErr) throw dbErr;

      setDocs((prev) => prev.filter((d) => d.file_url !== doc.file_url));
    } catch (err: any) {
      console.error('❌ Delete failed:', err);
      alert(`Delete failed: ${err?.message ?? err}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`p-6 overflow-y-auto text-${fontSize} text-indigo-200 space-y-6`}>
      <div>
        <h2 className="text-lg text-white font-semibold">🗂️ Uploaded Files</h2>

        {docs.length === 0 ? (
          <p className="text-gray-400 italic text-sm">No files uploaded yet.</p>
        ) : (
          <ul className="space-y-3 pt-2">
            {docs.map((doc) => (
              <li
                key={doc.file_url}
                className="bg-blue-950 border border-indigo-400 rounded-lg p-3 shadow flex items-center justify-between gap-3"
              >
                <span className="text-blue-100 font-medium truncate">{doc.file_name}</span>

                <div className="flex items-center gap-3 shrink-0">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-300 hover:underline text-xs"
                  >
                    Open ↗
                  </a>

                  <button
                    onClick={() => handleDelete(doc)}
                    disabled={busy === doc.file_url}
                    className={`text-xs px-2 py-1 rounded-md border ${
                      busy === doc.file_url
                        ? 'bg-gray-300 text-gray-600 border-gray-300 cursor-not-allowed'
                        : 'bg-red-600/90 hover:bg-red-600 text-white border-red-700'
                    }`}
                    title="Delete file"
                  >
                    {busy === doc.file_url ? 'Deleting…' : 'Delete'}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}