'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type FileDoc = { file_url: string; file_name: string };

type BuiltInFolder = 'uploaded' | 'generated' | 'converter' | 'generator';
type FolderId = BuiltInFolder | `custom:${string}`;
type CustomFolder = { id: `custom:${string}`; name: string };

export default function FilesPanel({
  recentDocs,
  fontSize,
}: {
  recentDocs: FileDoc[];
  fontSize: 'sm' | 'base' | 'lg';
}) {
  const [docs, setDocs] = useState<FileDoc[]>(recentDocs);
  const [busy, setBusy] = useState<string | null>(null);

  // Desktop state
  const [view, setView] = useState<FolderId | null>(null); // null => desktop
  const [selected, setSelected] = useState<string | null>(null);
  const [customFolders, setCustomFolders] = useState<CustomFolder[]>([]);

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

  const addCustomFolder = () => {
    const name = prompt('New folder name?')?.trim();
    if (!name) return;
    const id = `custom:${Date.now().toString(36)}` as const;
    setCustomFolders((f) => [...f, { id, name }]);
    setView(id);
  };

  // Placeholder “generated files” (UI only)
  const generatedFiles = useMemo(
    () => ['Weekly Summary.pdf', 'Sales_Insights_Q3.md', 'KPIs_2025-08-01.csv', 'Trends Snapshot.png'],
    []
  );

  // --- DESKTOP (wallpaper + icons) ---
  if (view === null) {
    const icons: Array<{
      id: string;
      icon: string;
      title: string;
      subtitle?: string;
      onOpen: () => void;
    }> = [
      {
        id: 'uploaded',
        icon: '📁',
        title: 'Uploaded Files',
        subtitle: `${docs.length} item${docs.length === 1 ? '' : 's'}`,
        onOpen: () => setView('uploaded'),
      },
      {
        id: 'generated',
        icon: '✨',
        title: 'Generated Files',
        subtitle: 'Placeholder routing',
        onOpen: () => setView('generated'),
      },
      {
        id: 'converter',
        icon: '🔁',
        title: 'File Converter',
        subtitle: 'PNG ⇄ JPG ⇄ WEBP',
        onOpen: () => setView('converter'),
      },
      {
        id: 'generator',
        icon: '🧩',
        title: 'File Generator',
        subtitle: 'Text / MD / CSV / JSON',
        onOpen: () => setView('generator'),
      },
      ...customFolders.map((f) => ({
        id: f.id,
        icon: '📁',
        title: f.name,
        subtitle: 'Empty',
        onOpen: () => setView(f.id),
      })),
      {
        id: 'new-folder',
        icon: '➕',
        title: 'New Folder',
        subtitle: 'Create a local folder (UI)',
        onOpen: addCustomFolder,
      },
    ];

    return (
      <div
        className={`relative h-full min-h-[520px] p-0 text-${fontSize}`}
        onClick={(e) => {
          if (e.currentTarget === e.target) setSelected(null);
        }}
      >
        {/* Wallpaper */}
        <div className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_20%_0%,rgba(147,197,253,0.10),transparent_60%),radial-gradient(50rem_30rem_at_80%_20%,rgba(167,139,250,0.12),transparent_55%),linear-gradient(180deg,#1E1B4B_0%,#1A1842_70%,#141233_100%)]" />
        <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:22px_22px] opacity-40" />

        {/* Taskbar */}
        <div className="absolute top-0 left-0 right-0 h-10 bg-indigo-900/40 backdrop-blur border-b border-indigo-500/30 flex items-center px-3 text-indigo-200">
          <span className="text-xs uppercase tracking-wider">Files</span>
          <span className="ml-3 text-[10px] text-indigo-300/90">Desktop</span>
        </div>

        {/* Icon grid — wider margins + bigger min column + larger gaps */}
        <div className="relative z-10 pt-20 pb-16 px-10">
          <div className="mx-auto max-w-6xl 2xl:max-w-7xl grid [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] gap-x-12 gap-y-14">
            {icons.map((it) => (
              <DesktopIcon
                key={it.id}
                icon={it.icon}
                title={it.title}
                subtitle={it.subtitle}
                selected={selected === it.id}
                onClick={() => setSelected(it.id)}
                onOpen={it.onOpen}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- WINDOWED APPS (folders/tools) ---
  return (
    <WindowShell
      title={titleFor(view, customFolders)}
      onClose={() => setView(null)}
    >
      {/* Uploaded */}
      {view === 'uploaded' && (
        <div className="space-y-3">
          {docs.length === 0 ? (
            <p className="text-indigo-300/90 italic">No files uploaded yet.</p>
          ) : (
            <ul className="space-y-3">
              {docs.map((doc) => (
                <li
                  key={doc.file_url}
                  className="group flex items-center justify-between gap-3 rounded-lg border border-indigo-500/40 bg-indigo-900/40 hover:bg-indigo-900/60 p-3 transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl">📄</span>
                    <span className="text-indigo-100 font-medium truncate">{doc.file_name}</span>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <a
                      href={doc.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-indigo-300 hover:text-white hover:underline text-xs"
                    >
                      Open ↗
                    </a>

                    <button
                      onClick={() => handleDelete(doc)}
                      disabled={busy === doc.file_url}
                      className={`text-xs px-2 py-1 rounded-md border transition ${
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
      )}

      {/* Generated (placeholder) */}
      {view === 'generated' && (
        <ul className="space-y-3">
          {generatedFiles.map((name, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-3 rounded-lg border border-indigo-500/40 bg-indigo-900/30 p-3"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl">🧠</span>
                <span className="truncate text-indigo-100">{name}</span>
              </div>
              <span className="text-xs text-indigo-300">placeholder</span>
            </li>
          ))}
        </ul>
      )}

      {/* File Converter */}
      {view === 'converter' && <FileConverter />}

      {/* File Generator */}
      {view === 'generator' && <FileGenerator />}

      {/* Custom */}
      {view?.startsWith('custom:') && (
        <div className="space-y-3">
          <div className="rounded-lg border border-indigo-500/40 bg-indigo-900/30 p-6 text-indigo-200">
            <p className="mb-2">This folder is empty.</p>
            <p className="text-indigo-300 text-sm">Custom folders are UI-only placeholders for now.</p>
          </div>
          <div className="flex">
            <button
              onClick={() =>
                setCustomFolders((fs) => fs.filter((f) => f.id !== view))
              }
              className="text-xs px-2 py-1 rounded-md border border-red-700 bg-red-600/90 hover:bg-red-600 text-white"
            >
              Remove Folder
            </button>
          </div>
        </div>
      )}
    </WindowShell>
  );
}

/* ---------- Desktop Icon (bigger size + more spacing) ---------- */
function DesktopIcon({
  icon,
  title,
  subtitle,
  selected,
  onClick,
  onOpen,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  selected?: boolean;
  onClick: () => void;
  onOpen: () => void;
}) {
  return (
    <div
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onOpen();
      }}
      className="group select-none w-36 focus:outline-none transition-transform hover:-translate-y-0.5"
    >
      <div
        className={`mx-auto h-24 w-24 grid place-items-center rounded-xl border
        ${selected ? 'bg-indigo-600/30 border-indigo-300' : 'bg-indigo-900/40 border-indigo-600/40 group-hover:border-indigo-400'}
        shadow-md transition`}
      >
        <div className="text-5xl">{icon}</div>
      </div>
      <div className="mt-3 text-center">
        <div className={`text-indigo-100 text-[13px] leading-4 ${selected ? 'font-semibold' : ''}`}>
          {title}
        </div>
        {subtitle && <div className="text-xs text-indigo-300 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

/* ---------- Window Shell (unchanged) ---------- */
function WindowShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const dragging = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const onDown: React.MouseEventHandler<HTMLDivElement> = (e) => {
    const el = shellRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    dragging.current = { x: e.clientX, y: e.clientY, left: rect.left, top: rect.top };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const onMove = (e: MouseEvent) => {
    if (!dragging.current || !shellRef.current) return;
    const dx = e.clientX - dragging.current.x;
    const dy = e.clientY - dragging.current.y;
    shellRef.current.style.left = `${dragging.current.left + dx}px`;
    shellRef.current.style.top = `${Math.max(40, dragging.current.top + dy)}px`;
  };
  const onUp = () => {
    dragging.current = null;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  return (
    <div className="relative h-full min-h-[520px]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,#1E1B4B_0%,#17163C_100%)]" />
      <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:22px_22px] opacity-40" />

      <div className="absolute top-0 left-0 right-0 h-10 bg-indigo-900/40 backdrop-blur border-b border-indigo-500/30 flex items-center px-3 text-indigo-200">
        <span className="text-xs uppercase tracking-wider">Files</span>
        <span className="ml-3 text-[10px] text-indigo-300/90">{title}</span>
      </div>

      <div
        ref={shellRef}
        className="absolute left-6 top-20 right-6 md:right-auto md:w-[min(860px,90%)] rounded-xl border border-indigo-500/40 bg-indigo-950/70 backdrop-blur shadow-2xl"
      >
        <div
          onMouseDown={onDown}
          className="cursor-move select-none flex items-center justify-between rounded-t-xl px-3 py-2 bg-indigo-900/60 border-b border-indigo-500/40"
        >
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-400" />
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <span className="ml-2 text-indigo-100 text-sm font-medium">{title}</span>
          </div>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded border border-indigo-500/50 text-indigo-200 hover:bg-indigo-800/50"
          >
            Close
          </button>
        </div>
        <div className="p-5 text-indigo-200">{children}</div>
      </div>
    </div>
  );
}

function titleFor(view: FolderId, customFolders: CustomFolder[]) {
  if (view === 'uploaded') return 'Uploaded Files';
  if (view === 'generated') return 'Generated Files';
  if (view === 'converter') return 'File Converter';
  if (view === 'generator') return 'File Generator';
  if (view.startsWith('custom:')) {
    return customFolders.find((f) => f.id === view)?.name || 'Folder';
  }
  return 'Files';
}

/* ---------- File Converter & Generator (unchanged from last version) ---------- */
function FileConverter() {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp'>('png');
  const [outUrl, setOutUrl] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const onPick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0] || null;
    setOutUrl(null);
    setStatus(null);
    setFile(f);
  };

  const convert = async () => {
    if (!file) return;
    setStatus('Converting…');
    setOutUrl(null);

    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.src = URL.createObjectURL(file);
      await new Promise((res, rej) => {
        img.onload = () => res(null);
        img.onerror = rej;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.drawImage(img, 0, 0);

      const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
      const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, mime, 0.92));
      if (!blob) throw new Error('Failed to create blob');

      const url = URL.createObjectURL(blob);
      setOutUrl(url);
      setStatus('Done');
    } catch (e: any) {
      console.error(e);
      setStatus(`Failed: ${e?.message ?? e}`);
    }
  };

  const download = () => {
    if (!file || !outUrl) return;
    const base = file.name.replace(/\.[^.]+$/, '');
    const a = document.createElement('a');
    a.href = outUrl;
    a.download = `${base}.${format}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="rounded-lg border border-indigo-500/40 bg-indigo-900/30 p-4 text-indigo-100 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="file"
          accept="image/*"
          onChange={onPick}
          className="text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-indigo-600/40 file:bg-indigo-900/60 file:text-indigo-100 file:hover:bg-indigo-900/80"
        />
        <div className="flex items-center gap-2">
          <label className="text-sm text-indigo-300">Convert to</label>
          <select
            value={format}
            onChange={(e) => setFormat(e.target.value as any)}
            className="bg-indigo-950/70 border border-indigo-600/40 rounded-md px-2 py-1 text-sm"
          >
            <option value="png">PNG</option>
            <option value="jpeg">JPG</option>
            <option value="webp">WEBP</option>
          </select>
        </div>
        <button
          onClick={convert}
          disabled={!file}
          className="px-3 py-1.5 rounded-md border border-indigo-600 bg-indigo-700 hover:bg-indigo-600 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Convert
        </button>
        {outUrl && (
          <button
            onClick={download}
            className="px-3 py-1.5 rounded-md border border-emerald-700 bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
          >
            Download
          </button>
        )}
      </div>

      {status && <div className="text-xs text-indigo-300">{status}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Preview title="Original" file={file} />
        <Preview title="Converted" url={outUrl} />
      </div>
    </div>
  );

  function Preview({ title, file, url }: { title: string; file?: File | null; url?: string | null }) {
    const [src, setSrc] = useState<string | null>(null);
    useEffect(() => {
      if (file) {
        const local = URL.createObjectURL(file);
        setSrc(local);
        return () => URL.revokeObjectURL(local);
      }
      setSrc(url ?? null);
    }, [file, url]);
    return (
      <div className="rounded-md border border-indigo-600/40 bg-indigo-950/40 p-3">
        <div className="text-indigo-300 text-xs mb-2">{title}</div>
        {src ? (
          <img ref={imgRef} src={src} className="max-h-80 w-auto rounded" alt={title} />
        ) : (
          <div className="h-40 grid place-items-center text-indigo-400 text-sm italic">No preview</div>
        )}
      </div>
    );
  }
}

function FileGenerator() {
  const [kind, setKind] = useState<'text' | 'markdown' | 'csv' | 'json'>('markdown');
  const [name, setName] = useState('NewFile');
  const [content, setContent] = useState(sampleFor('markdown'));

  useEffect(() => setContent(sampleFor(kind)), [kind]);

  const generate = () => {
    const { mime, ext } = meta(kind);
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name || 'NewFile'}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-indigo-500/40 bg-indigo-900/30 p-4 text-indigo-100 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-indigo-300 w-20">Type</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as any)}
            className="bg-indigo-950/70 border border-indigo-600/40 rounded-md px-2 py-1 text-sm w-full"
          >
            <option value="markdown">Markdown (.md)</option>
            <option value="text">Text (.txt)</option>
            <option value="csv">CSV (.csv)</option>
            <option value="json">JSON (.json)</option>
          </select>
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <label className="text-sm text-indigo-300 w-20">Filename</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="bg-indigo-950/70 border border-indigo-600/40 rounded-md px-2 py-1 text-sm w-full"
            placeholder="NewFile"
          />
        </div>
      </div>

      <div>
        <label className="text-sm text-indigo-300">Contents</label>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={12}
          className="mt-2 w-full bg-indigo-950/70 border border-indigo-600/40 rounded-md p-3 text-indigo-100 text-sm leading-5"
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={generate}
          className="px-3 py-1.5 rounded-md border border-emerald-700 bg-emerald-600 hover:bg-emerald-500 text-white text-sm"
        >
          Generate & Download
        </button>
        <button
          onClick={() => navigator.clipboard.writeText(content)}
          className="px-3 py-1.5 rounded-md border border-indigo-700 bg-indigo-700 hover:bg-indigo-600 text-white text-sm"
        >
          Copy to Clipboard
        </button>
      </div>
    </div>
  );

  function meta(kind: 'text' | 'markdown' | 'csv' | 'json') {
    switch (kind) {
      case 'text':
        return { mime: 'text/plain;charset=utf-8', ext: 'txt' };
      case 'markdown':
        return { mime: 'text/markdown;charset=utf-8', ext: 'md' };
      case 'csv':
        return { mime: 'text/csv;charset=utf-8', ext: 'csv' };
      case 'json':
        return { mime: 'application/json;charset=utf-8', ext: 'json' };
    }
  }
  function sampleFor(kind: 'text' | 'markdown' | 'csv' | 'json') {
    switch (kind) {
      case 'text':
        return 'New text file.\nAdd your notes here.';
      case 'markdown':
        return '# New Document\n\nWrite **Markdown** here.\n\n- Item 1\n- Item 2';
      case 'csv':
        return 'date,metric,value\n2025-08-20,Sessions,123\n2025-08-21,Sessions,156';
      case 'json':
        return JSON.stringify({ title: 'New JSON', items: [1, 2, 3] }, null, 2);
    }
  }
}
