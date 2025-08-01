'use client';

import React from 'react';

type FileDoc = {
  file_url: string;
  file_name: string;
};

export default function FilesPanel({ recentDocs }: { recentDocs: FileDoc[] }) {
  return (
    <div className="p-6 overflow-y-auto text-sm text-indigo-200 space-y-4">
      {/* 🗂️ Files Header */}
      <h2 className="text-lg text-white font-semibold">🗂️ Uploaded Files</h2>

      {recentDocs.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No files uploaded yet.</p>
      ) : (
        <ul className="space-y-3">
          {recentDocs.map((doc, i) => (
            <li
              key={i}
              className="bg-blue-950 border border-indigo-400 rounded-lg p-3 shadow flex items-center justify-between"
            >
              <span className="text-blue-100 font-medium truncate">{doc.file_name}</span>
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-300 hover:underline text-xs ml-4 shrink-0"
              >
                Open ↗
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}