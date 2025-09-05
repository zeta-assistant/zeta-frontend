'use client';

import React, { useState } from 'react';
import { SectionCard } from './common';

async function safeFetchJson(input: RequestInfo, init?: RequestInit) {
  const res = await fetch(input, init);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const text = await res.text();

  if (!ct.includes('application/json')) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${text.slice(0, 300)}`);
  }

  let json: any;
  try { json = JSON.parse(text); } catch { throw new Error('Invalid JSON from server'); }
  if (!res.ok) {
    throw new Error(json?.error || `HTTP ${res.status}`);
  }
  return json;
}

export default function ConverterView({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'png' | 'jpg' | 'webp'>('png');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [outName, setOutName] = useState<string | null>(null);

  const onPick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    setFile(e.target.files?.[0] ?? null);
    setStatus(null);
    setOutUrl(null);
    setOutName(null);
  };

  const convert = async () => {
    if (!file) return;
    setBusy(true);
    setStatus('⏳ Converting…');
    setOutUrl(null);
    setOutName(null);

    try {
      const form = new FormData();
      form.append('file', file);
      form.append('project_id', projectId);
      form.append('format', format);

      const json = await safeFetchJson('/api/file-converter', {
        method: 'POST',
        body: form,
      });

      setOutUrl(json.file_url);
      setOutName(json.file_name);
      setStatus(`✅ Converted → ${json.file_name}`);
    } catch (e: any) {
      setStatus(`❌ Failed: ${e?.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <SectionCard title="File Converter" subtitle="Convert images to PNG/JPG/WEBP and save to Generated Files">
      <div className="text-cyan-50 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
          <input
            type="file"
            accept="image/*"
            onChange={onPick}
            className="text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-cyan-600/40 file:bg-cyan-900/60 file:text-cyan-50 file:hover:bg-cyan-900/80"
          />
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as any)}
            className="bg-cyan-950/70 border border-cyan-600/40 rounded-md px-2 py-1 text-sm"
          >
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="webp">WEBP</option>
          </select>
          <button
            onClick={convert}
            disabled={!file || busy}
            className="px-3 py-1.5 rounded-md border border-cyan-600 bg-cyan-700 hover:bg-cyan-600 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? 'Converting…' : 'Convert'}
          </button>
          {file && (
            <span className="text-xs text-cyan-200 truncate max-w-[50ch]">
              Loaded: {file.name}
            </span>
          )}
        </div>

        {status && <div className="text-xs text-cyan-200">{status}</div>}

        {outUrl && (
          <div className="rounded-md border border-cyan-600/40 bg-cyan-950/40 p-3 flex items-center justify-between">
            <a
              href={outUrl}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline text-cyan-100 hover:text-cyan-50"
              title={outName || 'download'}
            >
              Open converted file ↗
            </a>
            <button
              onClick={() => {
                const a = document.createElement('a');
                a.href = outUrl;
                a.download = outName || 'converted';
                document.body.appendChild(a);
                a.click();
                a.remove();
              }}
              className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
            >
              Download
            </button>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
