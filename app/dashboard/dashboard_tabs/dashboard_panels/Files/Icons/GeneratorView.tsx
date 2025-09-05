'use client';

import React, { useState } from 'react';
import { SectionCard } from './common';

export default function GeneratorView({
  projectId,
  onGenerated,
}: {
  projectId: string;
  onGenerated: () => void;
}) {
  const [fileType, setFileType] = useState<'markdown' | 'text' | 'csv' | 'json'>('markdown');
  const [filename, setFilename] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const generate = async () => {
    if (!projectId) {
      setStatus('Missing projectId in UI.');
      return;
    }
    if (!description.trim() && !filename.trim()) {
      setStatus('Please provide a description or filename.');
      return;
    }
    setBusy(true);
    setStatus('Generating…');

    try {
      const res = await fetch('/api/docgen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          fileType,
          description,
          filename: filename || 'New_Document',
          modelId: 'gpt-4o',
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || 'Docgen failed');

      setStatus(`✅ Created: ${json.file_name}`);
      onGenerated();
    } catch (e: any) {
      setStatus(`❌ Failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="File Generator" subtitle="Choose type + describe, then generate into Generated Files">
      <div className="text-cyan-50 space-y-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm text-cyan-200">Type</label>
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value as any)}
            className="bg-cyan-950/70 border border-cyan-600/40 rounded-md px-2 py-1 text-sm"
          >
            <option value="markdown">Markdown (.md)</option>
            <option value="text">Text (.txt)</option>
            <option value="csv">CSV (.csv)</option>
            <option value="json">JSON (.json)</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-cyan-200">Filename</label>
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="w-full bg-cyan-950/70 border border-cyan-600/40 rounded-md px-2 py-1 text-sm placeholder-cyan-200/60"
            placeholder="New_Document"
          />
        </div>
        <div>
          <label className="text-sm text-cyan-200">Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={6}
            className="w-full bg-cyan-950/70 border border-cyan-600/40 rounded-md p-2 text-cyan-50 text-sm"
            placeholder="Describe the file contents..."
          />
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="px-3 py-1.5 rounded-md border border-emerald-700 bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Generate'}
        </button>
        {status && <div className="text-xs text-cyan-200">{status}</div>}
      </div>
    </SectionCard>
  );
}
