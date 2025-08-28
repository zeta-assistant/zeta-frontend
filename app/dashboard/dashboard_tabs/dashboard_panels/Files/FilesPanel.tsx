'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type FileDoc = { file_url: string; file_name: string };

// ✅ Added 'interpreter' and 'memory'
type BuiltInFolder = 'uploaded' | 'generated' | 'converter' | 'generator' | 'interpreter' | 'memory';
type FolderId = BuiltInFolder | `custom:${string}`;
type CustomFolder = { id: `custom:${string}`; name: string };

export default function FilesPanel({
  projectId,
  fontSize,
  recentDocs = [],
}: {
  projectId: string;
  fontSize: 'sm' | 'base' | 'lg';
  recentDocs?: FileDoc[];
}) {
  const [docs, setDocs] = useState<FileDoc[]>(recentDocs);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Desktop vs a specific folder/tool view
  const [view, setView] = useState<FolderId | null>(null); // null => desktop
  const [selected, setSelected] = useState<string | null>(null);
  const [customFolders, setCustomFolders] = useState<CustomFolder[]>([]);

  // New Folder modal
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const textSize =
    fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-base';

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

  const publicUrlForPath = (path: string) =>
    supabase.storage.from('project-docs').getPublicUrl(path).data.publicUrl;

  async function loadDocs() {
    setLoading(true);
    try {
      // 1) DB list
      const { data: rows, error } = await supabase
        .from('documents')
        .select('file_name,file_url')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) console.error('documents fetch error:', error);

      let out: FileDoc[] = (rows || []).map((r) => ({
        file_name: r.file_name,
        file_url: r.file_url ?? '',
      }));

      // 2) Storage list (merge)
      const { data: items } = await supabase.storage
        .from('project-docs')
        .list(projectId, {
          limit: 1000,
          sortBy: { column: 'name', order: 'asc' },
        });

      if (items?.length) {
        const fromStorage: FileDoc[] = items.map((it) => ({
          file_name: it.name,
          file_url: publicUrlForPath(`${projectId}/${it.name}`),
        }));
        const seen = new Set(out.map((d) => d.file_url || d.file_name));
        for (const s of fromStorage) {
          const key = s.file_url || s.file_name;
          if (!seen.has(key)) out.push(s);
        }
      }

      setDocs(out);
    } finally {
      setLoading(false);
    }
  }

  // Initial + on project change
  useEffect(() => {
    if (!projectId) return;
    loadDocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Realtime sync
  useEffect(() => {
    if (!projectId) return;

    const channel = supabase
      .channel(`documents:${projectId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'documents',
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            const row = payload.new as any;
            setDocs((prev) => [
              { file_name: row.file_name, file_url: row.file_url ?? '' },
              ...prev.filter((d) => d.file_url !== (row.file_url ?? '')),
            ]);
          } else if (payload.eventType === 'UPDATE') {
            const row = payload.new as any;
            setDocs((prev) =>
              prev.map((d) =>
                d.file_url === (row.file_url ?? '')
                  ? { file_name: row.file_name, file_url: row.file_url ?? '' }
                  : d
              )
            );
          } else if (payload.eventType === 'DELETE') {
            const row = payload.old as any;
            const url =
              row.file_url ??
              (row.file_name ? publicUrlForPath(`${projectId}/${row.file_name}`) : '');
            setDocs((prev) => prev.filter((d) => d.file_url !== url));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

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

      // Best-effort DB delete
      const { error: dbErr } = await supabase
        .from('documents')
        .delete()
        .eq('project_id', projectId)
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

  const openFolderModal = () => {
    setNewFolderName('');
    setShowFolderModal(true);
  };

  const createFolder = () => {
    const name = newFolderName.trim();
    if (!name) return;
    const id = `custom:${Date.now().toString(36)}` as const;
    setCustomFolders((f) => [...f, { id, name }]);
    setShowFolderModal(false);
    setView(id);
  };

  // Placeholder “generated files” (UI only)
  const generatedFiles = useMemo(
    () => ['Weekly Summary.pdf', 'Sales_Insights_Q3.md', 'KPIs_2025-08-01.csv', 'Trends Snapshot.png'],
    []
  );

  // ---------- UI ----------
  const title = titleFor(view, customFolders);

  return (
    <div className={`relative h-full min-h-[520px] ${textSize}`}>
      {/* Wallpaper */}
      <div className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_20%_0%,rgba(147,197,253,0.10),transparent_60%),radial-gradient(50rem_30rem_at_80%_20%,rgba(167,139,250,0.12),transparent_55%),linear-gradient(180deg,#1E1B4B_0%,#1A1842_70%,#141233_100%)]" />
      <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:22px_22px] opacity-40" />

      {/* Top bar */}
      <div className="relative z-10 h-10 bg-indigo-900/40 backdrop-blur border-b border-indigo-500/30 flex items-center justify-between px-3 text-indigo-200">
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider">Files</span>
          <span className="text-[10px] text-indigo-300/90">
            {view ? `Desktop / ${title}` : 'Desktop'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {view && (
            <button
              onClick={() => setView(null)}
              className="text-xs px-2 py-1 rounded-md border border-indigo-600/60 bg-indigo-800/60 hover:bg-indigo-700/60"
            >
              ← Back
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div
        className="relative z-10 pt-6 pb-10 px-6"
        onClick={(e) => {
          if (e.currentTarget === e.target) setSelected(null);
        }}
      >
        {/* Desktop icons */}
        {view === null && (
          <DesktopGrid
            docsCount={docs.length}
            customFolders={customFolders}
            selected={selected}
            setSelected={setSelected}
            onOpen={(v) => setView(v)}
            onNewFolder={openFolderModal}
          />
        )}

        {/* Inline “pages” */}
        {view === 'uploaded' && (
          <SectionCard
            title="Uploaded Files"
            subtitle={loading ? 'Loading…' : `${docs.length} item${docs.length === 1 ? '' : 's'}`}
            right={
              <button
                onClick={loadDocs}
                className="text-xs px-2 py-1 rounded-md border border-indigo-600/60 bg-indigo-800/60 hover:bg-indigo-700/60"
              >
                Refresh
              </button>
            }
          >
            {docs.length === 0 ? (
              <p className="text-indigo-300/90 italic">No files uploaded yet.</p>
            ) : (
              <FileList docs={docs} onDelete={handleDelete} busyUrl={busy} />
            )}
          </SectionCard>
        )}

        {view === 'generated' && (
          <SectionCard title="Generated Files" subtitle="Placeholder">
            <ul className="space-y-3">
              {generatedFiles.map((name, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between gap-3 rounded-lg border border-indigo-500/40 bg-indigo-900/30 p-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl">✨</span>
                    <span className="truncate text-indigo-100">{name}</span>
                  </div>
                  <span className="text-xs text-indigo-300">placeholder</span>
                </li>
              ))}
            </ul>
          </SectionCard>
        )}

        {view === 'converter' && (
          <SectionCard title="File Converter" subtitle="PNG ⇄ JPG ⇄ WEBP">
            <FileConverter />
          </SectionCard>
        )}

        {view === 'generator' && (
          <SectionCard title="File Generator" subtitle="Text / MD / CSV / JSON">
            <FileGenerator />
          </SectionCard>
        )}

        {/* ✅ New views */}
        {view === 'interpreter' && (
          <SectionCard title="Code Interpreter" subtitle="Summarize text-like files (.txt/.md/.csv/.json)">
            <CodeInterpreter />
          </SectionCard>
        )}

        {view === 'memory' && (
          <SectionCard title="Memory Files" subtitle="Zeta’s internal/context files (placeholder)">
            <MemoryFiles />
          </SectionCard>
        )}

        {view?.startsWith('custom:') && (
          <SectionCard title={titleFor(view, customFolders)} subtitle="UI-only folder">
            <p className="text-indigo-300/90 italic">This folder is empty.</p>
          </SectionCard>
        )}
      </div>

      {/* New Folder Modal */}
      <Modal open={showFolderModal} title="Create New Folder" onClose={() => setShowFolderModal(false)}>
        <div className="space-y-4">
          <label className="block text-sm text-indigo-2 00">
            Folder name
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="mt-1 w-full bg-indigo-950/70 border border-indigo-600/40 rounded-md px-3 py-2 text-indigo-100"
              placeholder="My Folder"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowFolderModal(false)}
              className="text-xs px-3 py-1.5 rounded-md border border-indigo-600/60 bg-indigo-800/60 hover:bg-indigo-700/60"
            >
              Cancel
            </button>
            <button
              onClick={createFolder}
              className="text-xs px-3 py-1.5 rounded-md border border-emerald-700 bg-emerald-600 hover:bg-emerald-500 text-white"
            >
              Create
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- Desktop (icons) ---------- */
function DesktopGrid({
  docsCount,
  customFolders,
  selected,
  setSelected,
  onOpen,
  onNewFolder,
}: {
  docsCount: number;
  customFolders: CustomFolder[];
  selected: string | null;
  setSelected: (id: string | null) => void;
  onOpen: (view: FolderId) => void;
  onNewFolder: () => void;
}) {
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
      subtitle: `${docsCount} item${docsCount === 1 ? '' : 's'}`,
      onOpen: () => onOpen('uploaded'),
    },
    { id: 'generated', icon: '✨', title: 'Generated Files', subtitle: 'Placeholder', onOpen: () => onOpen('generated') },
    { id: 'converter', icon: '🔁', title: 'File Converter', subtitle: 'PNG ⇄ JPG ⇄ WEBP', onOpen: () => onOpen('converter') },
    { id: 'generator', icon: '🧩', title: 'File Generator', subtitle: 'Text / MD / CSV / JSON', onOpen: () => onOpen('generator') },
    // ✅ New icons
    { id: 'interpreter', icon: '📝', title: 'Code Interpreter', subtitle: 'Summarize files', onOpen: () => onOpen('interpreter') },
    { id: 'memory', icon: '🧠', title: 'Memory Files', subtitle: 'Context store', onOpen: () => onOpen('memory') },

    ...customFolders.map((f) => ({
      id: f.id,
      icon: '📁',
      title: f.name,
      subtitle: 'Empty',
      onOpen: () => onOpen(f.id),
    })),
    { id: 'new-folder', icon: '➕', title: 'New Folder', subtitle: 'Create a local folder (UI)', onOpen: onNewFolder },
  ];

  return (
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
  );
}

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
        <div className={`text-indigo-100 text-[13px] leading-4 ${selected ? 'font-semibold' : ''}`}>{title}</div>
        {subtitle && <div className="text-xs text-indigo-300 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}

/* ---------- Section wrapper (inline page card) ---------- */
function SectionCard({
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
          <div className="text-indigo-100 font-medium">{title}</div>
          {subtitle && <div className="text-[12px] text-indigo-300/90">{subtitle}</div>}
        </div>
        {right}
      </div>
      <div className="rounded-xl border border-indigo-500/40 bg-indigo-950/60 p-4">{children}</div>
    </div>
  );
}

/* ---------- File list (shared layout) ---------- */
function FileList({
  docs,
  onDelete,
  busyUrl,
}: {
  docs: FileDoc[];
  onDelete: (d: FileDoc) => void;
  busyUrl: string | null;
}) {
  return (
    <ul className="space-y-3">
      {docs.map((doc) => (
        <li
          key={doc.file_url || doc.file_name}
          className="group flex items-center justify-between gap-3 rounded-lg border border-indigo-500/40 bg-indigo-900/40 hover:bg-indigo-900/60 p-3 transition"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-xl">📄</span>
            <span className="text-indigo-100 font-medium truncate">{doc.file_name}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {doc.file_url ? (
              <a
                href={doc.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-300 hover:text-white hover:underline text-xs"
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
                  : 'bg-red-600/90 hover:bg-red-600 text-white border-red-700'
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

/* ---------- Modal ---------- */
function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 backdrop-blur-sm">
      <div className="w-[min(520px,92vw)] rounded-2xl border border-indigo-500/40 bg-indigo-950/90 shadow-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-indigo-100 font-medium">{title}</div>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded-md border border-indigo-600/60 bg-indigo-800/60 hover:bg-indigo-700/60"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function titleFor(view: FolderId | null, customFolders: CustomFolder[]) {
  if (!view) return 'Files';
  if (view === 'uploaded') return 'Uploaded Files';
  if (view === 'generated') return 'Generated Files';
  if (view === 'converter') return 'File Converter';
  if (view === 'generator') return 'File Generator';
  if (view === 'interpreter') return 'Code Interpreter';
  if (view === 'memory') return 'Memory Files';
  if (view?.startsWith('custom:')) {
    return customFolders.find((f) => f.id === view)?.name || 'Folder';
  }
  return 'Files';
}

/* ---------- File Converter ---------- */
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
      // @ts-ignore
      canvas.width = img.width;
      // @ts-ignore
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.drawImage(img, 0, 0);

      const mime = format === 'jpeg' ? 'image/jpeg' : `image/${format}`;
      const blob: Blob | null = await new Promise((res) => (canvas as any).toBlob(res, mime, 0.92));
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
    <div className="text-indigo-100 space-y-4">
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
    const imgLocalRef = useRef<HTMLImageElement | null>(null);
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
          <img ref={imgLocalRef} src={src} className="max-h-80 w-auto rounded" alt={title} />
        ) : (
          <div className="h-40 grid place-items-center text-indigo-400 text-sm italic">No preview</div>
        )}
      </div>
    );
  }
}

/* ---------- File Generator ---------- */
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
    <div className="text-indigo-100 space-y-4">
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

/* ---------- Code Interpreter (placeholder but usable for text) ---------- */
function CodeInterpreter() {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState<string>('');
  const [summary, setSummary] = useState<{
    lines: number;
    words: number;
    topWords: Array<{ w: string; c: number }>;
    preview: string;
  } | null>(null);

  const onPick: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setText('');
    setSummary(null);
    if (!f) return;

    // Only quick text-based types for now
    const ok =
      /^text\//.test(f.type) ||
      /\.md$/i.test(f.name) ||
      /\.csv$/i.test(f.name) ||
      /\.json$/i.test(f.name) ||
      f.type === 'application/json' ||
      f.type === 'text/csv';
    if (!ok) {
      setText('Unsupported file for quick preview. Try .txt / .md / .csv / .json.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => setText(String(reader.result || ''));
    reader.onerror = () => setText('Failed to read file.');
    reader.readAsText(f);
  };

  const analyze = () => {
    if (!text) return;
    const lines = text.split(/\r?\n/);
    const wordsArr = text.toLowerCase().match(/[a-z0-9'_]+/g) || [];
    const stop = new Set([
      'the','a','an','is','are','to','of','and','in','on','for','with','by','as','at','or','it',
      'be','this','that','from','was','were','will','would','can','could','should','has','have',
      'had','not','no','yes','you','your','we','our','they','their','i','me','my'
    ]);
    const freq = new Map<string, number>();
    for (const w of wordsArr) {
      if (stop.has(w)) continue;
      freq.set(w, (freq.get(w) || 0) + 1);
    }
    const topWords = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([w, c]) => ({ w, c }));

    const preview = lines.slice(0, 10).join('\n');
    setSummary({
      lines: lines.length,
      words: wordsArr.length,
      topWords,
      preview,
    });
  };

  return (
    <div className="text-indigo-100 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="file"
          accept=".txt,.md,.csv,.json,text/*,application/json"
          onChange={onPick}
          className="text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-indigo-600/40 file:bg-indigo-900/60 file:text-indigo-100 file:hover:bg-indigo-900/80"
        />
        <button
          onClick={analyze}
          disabled={!text}
          className="px-3 py-1.5 rounded-md border border-indigo-600 bg-indigo-700 hover:bg-indigo-600 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Summarize
        </button>
        {file && (
          <span className="text-xs text-indigo-300 truncate max-w-[50ch]">Loaded: {file.name}</span>
        )}
      </div>

      {!text && (
        <div className="text-xs text-indigo-300">
          Drop in a <code>.txt</code>, <code>.md</code>, <code>.csv</code>, or <code>.json</code> file to preview and
          get a quick summary. (PDF/Docs not supported in this placeholder.)
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-md border border-indigo-600/40 bg-indigo-950/40 p-3">
            <div className="text-indigo-300 text-xs mb-2">Stats</div>
            <div className="text-sm">Lines: {summary.lines.toLocaleString()}</div>
            <div className="text-sm">Words: {summary.words.toLocaleString()}</div>
            <div className="text-sm mt-2">Top terms:</div>
            <ul className="mt-1 text-xs text-indigo-200 space-y-0.5">
              {summary.topWords.map((t) => (
                <li key={t.w} className="flex justify-between">
                  <span className="truncate">{t.w}</span>
                  <span className="opacity-80">{t.c}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="md:col-span-2 rounded-md border border-indigo-600/40 bg-indigo-950/40 p-3">
            <div className="text-indigo-300 text-xs mb-2">Preview</div>
            <pre className="whitespace-pre-wrap text-xs leading-5 text-indigo-100 max-h-64 overflow-auto">
              {summary.preview}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Memory Files (placeholder) ---------- */
function MemoryFiles() {
  const memoryItems = [
    { name: 'agent-profile.json', note: 'Core persona/context' },
    { name: 'workspace-index.json', note: 'Project memory index' },
    { name: 'recenthighlights.md', note: 'Recent insights' },
  ];
  return (
    <div className="text-indigo-100">
      <p className="text-sm text-indigo-300 mb-3">
        Placeholder view. This will show/edit internal memory/context files in a future update.
      </p>
      <ul className="space-y-2">
        {memoryItems.map((m) => (
          <li
            key={m.name}
            className="flex items-center justify-between gap-3 rounded-lg border border-indigo-500/40 bg-indigo-900/30 p-3"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-xl">🧠</span>
              <span className="truncate">{m.name}</span>
            </div>
            <span className="text-xs text-indigo-300">{m.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
