'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { SectionCard } from './common';
import { supabase } from '@/lib/supabaseClient';

const SUPPORTED_ACCEPT = [
  '.xbl','.xsl','.xslt','.vtt','.text','.txt','.ehtml',
  '.sh','.html','.ics','.mjs','.js','.shtml',
  '.xml','.csv','.css','.shtm','.htm',
  '.json','.md'
].join(',');

async function safeFetchJson(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, init);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const txt = await res.text();
  if (!ct.includes('application/json')) throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt.slice(0, 300)}`);
  let json: any; try { json = JSON.parse(txt); } catch { throw new Error('Invalid JSON from server'); }
  if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
  return json;
}

type RemoteDoc = {
  file_name: string;
  file_url: string;
  storage_key?: string | null;
  created_by?: 'user' | 'zeta' | null;
};

export default function InterpreterView({ projectId }: { projectId: string }) {
  const [mode, setMode] = useState<'local' | 'uploaded' | 'generated'>('local');

  // shared UI state
  const [status, setStatus] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [model, setModel] = useState<string>('gpt-4o-mini');

  // local file state
  const [file, setFile] = useState<File | null>(null);

  // uploaded list
  const [uploaded, setUploaded] = useState<RemoteDoc[]>([]);
  const [selectedUploadedKey, setSelectedUploadedKey] = useState<string | null>(null);

  // generated list
  const [generated, setGenerated] = useState<RemoteDoc[]>([]);
  const [selectedGeneratedKey, setSelectedGeneratedKey] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────
  // Load "uploaded" files via your /api/project-files endpoint
  // ─────────────────────────────────────────────────────────
  async function loadUploaded() {
    try {
      const res = await fetch(`/api/project-files?project_id=${projectId}&limit=100`);
      const { rows } = await res.json();
      const list: RemoteDoc[] = (rows || []).map((r: any) => ({
        file_name: r.file_name,
        file_url: r.file_url,
        storage_key: r.storage_key ?? null,
        created_by: (r.created_by as 'user' | 'zeta' | null) ?? null,
      }));
      // prefer items under /uploaded or created_by user
      const uploadedFirst = list.filter(
        d => (d.storage_key && d.storage_key.includes('/uploaded/')) || d.created_by === 'user'
      );
      setUploaded(uploadedFirst.length ? uploadedFirst : list);
    } catch {
      setUploaded([]);
    }
  }

  // ─────────────────────────────────────────────────────────
  // Load "generated" files directly from Storage
  // ─────────────────────────────────────────────────────────
  async function loadGenerated() {
    try {
      const folder = `${projectId}/generated`;
      const { data: items, error } = await supabase
        .storage
        .from('project-docs')
        .list(folder, { limit: 1000, sortBy: { column: 'name', order: 'desc' } });

      if (error?.message?.includes('does not exist')) { setGenerated([]); return; }

      const list: RemoteDoc[] = (items ?? [])
        .filter((it) => it?.name && !it.name.endsWith('/'))
        .map((it) => {
          const storage_key = `${folder}/${it.name}`;
          const file_url = supabase.storage.from('project-docs').getPublicUrl(storage_key).data.publicUrl;
          return { file_name: it.name, file_url, storage_key, created_by: 'zeta' };
        });

      setGenerated(list);
    } catch {
      setGenerated([]);
    }
  }

  useEffect(() => {
    if (!projectId) return;
    loadUploaded();
    loadGenerated();
  }, [projectId]);

  const selectedUploadedDoc = useMemo(
    () => uploaded.find(d => (d.storage_key || d.file_url) === selectedUploadedKey) || null,
    [uploaded, selectedUploadedKey]
  );

  const selectedGeneratedDoc = useMemo(
    () => generated.find(d => (d.storage_key || d.file_url) === selectedGeneratedKey) || null,
    [generated, selectedGeneratedKey]
  );

  // ─────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────
  const onPick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setStatus(null);
    setSummary(null);
  };

  async function interpretLocal() {
    if (!file) return;
    setStatus('⏳ Uploading & summarizing…');
    setSummary(null);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('project_id', projectId);
      form.append('model', model);

      const json = await safeFetchJson('/api/interpreter', { method: 'POST', body: form });
      const text = (json.summary ?? '').trim() ||
      (json.reason ? `(${json.reason})` : '') ||     
       'No summary generated (file may be empty).';
      setSummary(text);
      setStatus(`✅ Summarized: ${file.name}${json.truncated ? ' (truncated input)' : ''}`);
    } catch (e: any) {
      setStatus(`❌ Failed: ${e?.message ?? e}`);
    }
  }

  async function interpretRemote(doc: RemoteDoc | null) {
    if (!doc) return;
    setStatus('⏳ Fetching & summarizing…');
    setSummary(null);

    try {
      const payload = {
        project_id: projectId,
        model,
        storage_key: doc.storage_key ?? undefined,
        file_url: doc.storage_key ? undefined : doc.file_url,
      };
      const json = await safeFetchJson('/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const text = (json.summary ?? '').trim() ||
      (json.reason ? `(${json.reason})` : '') ||    
        'No summary generated (file may be empty).';
      setSummary(text);
      setStatus(`✅ Summarized: ${doc.file_name}${json.truncated ? ' (truncated input)' : ''}`);
    } catch (e: any) {
      setStatus(`❌ Failed: ${e?.message ?? e}`);
    }
  }

  // ─────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────
  return (
    <SectionCard title="File Interpreter" subtitle="AI summary for text-like files (txt, md, csv, json, html, etc.)">
      <div className="text-cyan-50 space-y-5">
        {/* Mode + Model */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex gap-3 items-center">
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="mode" value="local" checked={mode === 'local'} onChange={() => setMode('local')} />
              Local file
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="mode" value="uploaded" checked={mode === 'uploaded'} onChange={() => setMode('uploaded')} />
              From Uploaded
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="radio" name="mode" value="generated" checked={mode === 'generated'} onChange={() => setMode('generated')} />
              From Generated
            </label>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-cyan-200/90">Model</span>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="bg-cyan-950/70 border border-cyan-600/40 rounded-md px-2 py-1 text-sm"
            >
              <option value="gpt-4o-mini">gpt-4o-mini</option>
              <option value="gpt-4o">gpt-4o</option>
            </select>
          </div>
        </div>

        {/* Local */}
        {mode === 'local' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <input
                type="file"
                accept={SUPPORTED_ACCEPT}
                onChange={onPick}
                className="text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-cyan-600/40 file:bg-cyan-900/60 file:text-cyan-50 file:hover:bg-cyan-900/80"
              />
              <button
                onClick={interpretLocal}
                disabled={!file}
                className="px-3 py-1.5 rounded-md border border-cyan-600 bg-cyan-700 hover:bg-cyan-600 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Summarize
              </button>
              {file && <span className="text-xs text-cyan-200 truncate max-w-[50ch]">Loaded: {file.name}</span>}
            </div>
            <div className="text-[11px] text-cyan-300/90">
              Supported types: <code className="text-cyan-100">{SUPPORTED_ACCEPT}</code>
            </div>
          </div>
        )}

        {/* Uploaded */}
        {mode === 'uploaded' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <select
                value={selectedUploadedKey ?? ''}
                onChange={(e) => setSelectedUploadedKey(e.target.value || null)}
                className="min-w-[280px] bg-cyan-950/70 border border-cyan-600/40 rounded-md px-2 py-1 text-sm"
              >
                <option value="">Select a file…</option>
                {uploaded.map((d) => {
                  const key = d.storage_key || d.file_url;
                  const label = `${d.file_name}${d.created_by === 'zeta' ? ' (generated)' : ''}`;
                  return <option key={key} value={key}>{label}</option>;
                })}
              </select>
              <button
                onClick={() => interpretRemote(selectedUploadedDoc)}
                disabled={!selectedUploadedKey}
                className="px-3 py-1.5 rounded-md border border-cyan-600 bg-cyan-700 hover:bg-cyan-600 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Summarize
              </button>
              <button
                onClick={loadUploaded}
                className="px-3 py-1.5 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60 text-white text-xs"
              >
                Refresh
              </button>
            </div>
            <div className="text-[11px] text-cyan-300/90">
              Reads from your project’s <code>/uploaded</code> files (falls back to recent docs).
            </div>
          </div>
        )}

        {/* Generated */}
        {mode === 'generated' && (
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <select
                value={selectedGeneratedKey ?? ''}
                onChange={(e) => setSelectedGeneratedKey(e.target.value || null)}
                className="min-w-[280px] bg-cyan-950/70 border border-cyan-600/40 rounded-md px-2 py-1 text-sm"
              >
                <option value="">Select a generated file…</option>
                {generated.map((d) => {
                  const key = d.storage_key || d.file_url;
                  const label = `${d.file_name} (generated)`;
                  return <option key={key} value={key}>{label}</option>;
                })}
              </select>
              <button
                onClick={() => interpretRemote(selectedGeneratedDoc)}
                disabled={!selectedGeneratedKey}
                className="px-3 py-1.5 rounded-md border border-cyan-600 bg-cyan-700 hover:bg-cyan-600 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Summarize
              </button>
              <button
                onClick={loadGenerated}
                className="px-3 py-1.5 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60 text-white text-xs"
              >
                Refresh
              </button>
            </div>
            <div className="text-[11px] text-cyan-300/90">
              Reads from your project’s <code>/generated</code> folder.
            </div>
          </div>
        )}

        {status && <div className="text-xs text-cyan-200">{status}</div>}

        {summary && (
          <div className="rounded-md border border-cyan-600/40 bg-cyan-950/40 p-4">
            <div className="text-cyan-200 text-xs mb-2">Summary</div>
            <pre className="whitespace-pre-wrap text-sm leading-6 text-cyan-50 max-h-96 overflow-auto">{summary}</pre>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
