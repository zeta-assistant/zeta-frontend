'use client';

import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

/* ---------- Types ---------- */
type FileDoc = {
  file_url: string;
  file_name: string;
  created_at?: string | null;
  created_by?: 'user' | 'zeta' | null;
};

// Built-in views
type BuiltInFolder = 'uploaded' | 'generated' | 'converter' | 'generator' | 'interpreter' | 'memory';
type FolderId = BuiltInFolder | `custom:${string}`;
type CustomFolder = { id: `custom:${string}`; name: string };

/* ---------- Component ---------- */
export default function FilesPanel({
  projectId,
  fontSize,
  recentDocs = [],
}: {
  projectId: string;
  fontSize: 'sm' | 'base' | 'lg';
  recentDocs?: FileDoc[];
}) {
  const [docs, setDocs] = useState<FileDoc[]>(recentDocs);  // root uploaded + DB
  const [genDocs, setGenDocs] = useState<FileDoc[]>([]);    // generated/*
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingGen, setLoadingGen] = useState<boolean>(false);
  const [memoryCount, setMemoryCount] = useState<number>(0);

  const [view, setView] = useState<FolderId | null>(null); // null => desktop
  const [selected, setSelected] = useState<string | null>(null);
  const [customFolders, setCustomFolders] = useState<CustomFolder[]>([]);

  // New Folder modal
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const textSize = fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-base';

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
    // Try with created_by (new schema). If it fails, fallback to old schema.
    let rows: any[] | null = null;

    const q1 = await supabase
      .from('documents')
      .select('file_name,file_url,created_at,created_by')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });

    if (q1.error) {
      console.warn(
        'documents fetch (with created_by) failed, retrying without it:',
        q1.error?.message || q1.error
      );
      const q2 = await supabase
        .from('documents')
        .select('file_name,file_url,created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (q2.error) {
        console.error('documents fetch error:', q2.error?.message || q2.error);
        rows = []; // fail gracefully
      } else {
        rows = q2.data ?? [];
      }
    } else {
      rows = q1.data ?? [];
    }

    let out: FileDoc[] = (rows || []).map((r: any) => ({
      file_name: r.file_name,
      file_url: r.file_url ?? '',
      created_at: r.created_at ?? null,
      created_by: (r.created_by as 'user' | 'zeta' | null) ?? null,
    }));

    // Merge with Storage listing (root uploaded)
    const { data: items, error: listErr } = await supabase.storage
      .from('project-docs')
      .list(projectId, { limit: 1000, sortBy: { column: 'name', order: 'asc' } });

    if (listErr) {
      console.warn('storage list (root) warning:', listErr?.message || listErr);
    } else if (items?.length) {
      const fromStorage: FileDoc[] = items.map((it) => ({
        file_name: it.name,
        file_url: publicUrlForPath(`${projectId}/${it.name}`),
        created_at: null,
        created_by: null,
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
async function loadMemoryCount() {
  if (!projectId) {
    setMemoryCount(0);
    return;
  }
  try {
    const { data: { user } } = await supabase.auth.getUser();

    // Count rows in the daily memory table for this project (and user if present)
    let q = supabase
      .from('zeta_daily_memory')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', projectId);

    if (user?.id) q = q.eq('user_id', user.id);

    const { count, error } = await q;
    if (error) throw error;

    setMemoryCount(count || 0);
  } catch {
    setMemoryCount(0);
  }
}


  async function loadGenerated() {
    setLoadingGen(true);
    try {
      const { data: items, error } = await supabase.storage
        .from('project-docs')
        .list(`${projectId}/generated`, { limit: 1000, sortBy: { column: 'name', order: 'desc' } });

      if (error?.message?.includes('does not exist')) {
        setGenDocs([]);
        return;
      }
      if (error) console.error('generated list error:', error);

      const list: FileDoc[] = (items || []).map((it) => ({
  file_name: it.name,
  file_url: publicUrlForPath(`${projectId}/generated/${it.name}`),
  created_at: null,
  created_by: 'zeta' as const, // literal type
}));
setGenDocs(list);
    } finally {
      setLoadingGen(false);
    }
  }

  // Initial + on project change
 
useEffect(() => {
  if (!projectId) return;
  loadDocs();
  loadGenerated();
  loadMemoryCount();  // 👈 add this
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [projectId]);


  // Realtime: refresh both panes on any documents change
  useEffect(() => {
    if (!projectId) return;
    const channel = supabase
      .channel(`documents:${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'documents', filter: `project_id=eq.${projectId}` },
        () => {
          loadDocs();
          loadGenerated();
        }
      )
      .subscribe();

    return () => {
      // cleanup must be sync for React types
      void supabase.removeChannel(channel);
    };
  }, [projectId]);

  const handleDelete = async (doc: FileDoc) => {
    if (!confirm(`Delete "${doc.file_name}"? This can’t be undone.`)) return;
    setBusy(doc.file_url);

    try {
      const res = await fetch('/api/docgen/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, fileUrl: doc.file_url, fileName: doc.file_name }),
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        /* ignore */
      }

      if (!res.ok || json?.error) {
        const msg = json?.error || text || `HTTP ${res.status}`;
        throw new Error(msg);
      }

      setDocs((prev) => prev.filter((d) => d.file_url !== doc.file_url));
      setGenDocs((prev) => prev.filter((d) => d.file_url !== doc.file_url));
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

  const title = titleFor(view, customFolders);

  /* ---------- UI ---------- */
  return (
    <div className={`relative h-full min-h-[520px] ${textSize}`}>
      {/* Wallpaper (teal / light blue) */}
      <div className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_20%_0%,rgba(125,211,252,0.10),transparent_60%),radial-gradient(50rem_30rem_at_80%_20%,rgba(20,184,166,0.12),transparent_55%),linear-gradient(180deg,#063750_0%,#053244_70%,#042836_100%)]" />
      <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px] opacity-40" />

      {/* Top bar */}
      <div className="relative z-10 h-10 bg-cyan-900/40 backdrop-blur border-b border-cyan-500/30 flex items-center justify-between px-3 text-cyan-100">
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider">Files</span>
          <span className="text-[10px] text-cyan-200/90">{view ? `Desktop / ${title}` : 'Desktop'}</span>
        </div>
        <div className="flex items-center gap-2">
          {view && (
            <button
              onClick={() => setView(null)}
              className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
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
    uploadedCount={docs.length}
    generatedCount={genDocs.length}
    memoryCount={memoryCount}   // <- add this
    customFolders={customFolders}
    selected={selected}
    setSelected={setSelected}
    onOpen={(v) => setView(v)}
    onNewFolder={openFolderModal}
  />
        )}

        {/* Uploaded */}
        {view === 'uploaded' && (
          <SectionCard
            title="Uploaded Files"
            subtitle={loading ? 'Loading…' : `${docs.length} item${docs.length === 1 ? '' : 's'}`}
            right={
              <button
                onClick={() => {
                  loadDocs();
                }}
                className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
              >
                Refresh
              </button>
            }
          >
            {docs.length === 0 ? (
              <p className="text-cyan-200/90 italic">No files uploaded yet.</p>
            ) : (
              <FileList docs={docs} onDelete={handleDelete} busyUrl={busy} />
            )}
          </SectionCard>
        )}

        {/* Generated */}
        {view === 'generated' && (
          <SectionCard
            title="Generated Files"
            subtitle={loadingGen ? 'Loading…' : `${genDocs.length} item${genDocs.length === 1 ? '' : 's'}`}
            right={
              <button
                onClick={() => {
                  loadGenerated();
                }}
                className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
              >
                Refresh
              </button>
            }
          >
            {genDocs.length === 0 ? (
              <p className="text-cyan-200/90 italic">
                No generated files yet. Zeta will create files here when you request docgen.
              </p>
            ) : (
              <FileList docs={genDocs} onDelete={handleDelete} busyUrl={busy} />
            )}
          </SectionCard>
        )}

        {/* Converter */}
        {view === 'converter' && (
          <SectionCard title="File Converter" subtitle="PNG ⇄ JPG ⇄ WEBP">
            <FileConverter projectId={projectId} />
          </SectionCard>
        )}

        {/* Generator (user trigger → Edge Function) */}
        {view === 'generator' && (
          <SectionCard
            title="File Generator"
            subtitle="Choose type + describe, then generate into Generated Files"
          >
            <DocGenForm projectId={projectId} onGenerated={loadGenerated} />
          </SectionCard>
        )}

        {/* Interpreter */}
        {view === 'interpreter' && (
          <SectionCard title="File Interpreter" subtitle="Summarize text-like files (.txt/.md/.csv/.json)">
            <FileInterpreter projectId={projectId} />
          </SectionCard>
        )}

        {/* Memory */}
        {view === 'memory' && (
          <SectionCard title="Memory Files" subtitle="Zeta’s internal/context files">
            <MemoryFiles projectId={projectId} allowManualGenerate={false} />
          </SectionCard>
        )}

        {/* Custom */}
        {view?.startsWith('custom:') && (
          <SectionCard title={titleFor(view, customFolders)} subtitle="UI-only folder">
            <p className="text-cyan-200/90 italic">This folder is empty.</p>
          </SectionCard>
        )}
      </div>

      {/* Modal */}
      <Modal open={showFolderModal} title="Create New Folder" onClose={() => setShowFolderModal(false)}>
        <div className="space-y-4">
          <label className="block text-sm text-cyan-100">
            Folder name
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              className="mt-1 w-full bg-cyan-950/70 border border-cyan-600/40 rounded-md px-3 py-2 text-cyan-50 placeholder-cyan-200/60"
              placeholder="My Folder"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowFolderModal(false)}
              className="text-xs px-3 py-1.5 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
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

/* ---------- Helpers ---------- */
function titleFor(view: FolderId | null, customFolders: CustomFolder[]) {
  if (!view) return 'Files';
  if (view === 'uploaded') return 'Uploaded Files';
  if (view === 'generated') return 'Generated Files';
  if (view === 'converter') return 'File Converter';
  if (view === 'generator') return 'File Generator';
  if (view === 'interpreter') return 'File Interpreter';
  if (view === 'memory') return 'Memory Files';
  if (view?.startsWith('custom:')) return customFolders.find((f) => f.id === view)?.name || 'Folder';
  return 'Files';
}

function fromNow(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = (Date.now() - d.getTime()) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return d.toLocaleString();
}

function CreatorBadge({ who }: { who?: 'user' | 'zeta' | null }) {
  const label = who === 'zeta' ? 'Zeta' : who === 'user' ? 'User' : 'Unknown';
  const c =
    who === 'zeta'
      ? 'bg-emerald-600/20 text-emerald-200 border-emerald-500/40'
      : who === 'user'
      ? 'bg-sky-600/20 text-sky-200 border-sky-500/40'
      : 'bg-slate-600/20 text-slate-200 border-slate-500/40';
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${c}`}>{label}</span>;
}


/* ---------- Desktop (icons) ---------- */
function DesktopGrid({
  uploadedCount,
  generatedCount,
  memoryCount,
  customFolders,
  selected,
  setSelected,
  onOpen,
  onNewFolder,
}: {
  uploadedCount: number;
  generatedCount: number;
  memoryCount: number;
  customFolders: CustomFolder[];
  selected: string | null;
  setSelected: (id: string | null) => void;
  onOpen: (view: FolderId) => void;
  onNewFolder: () => void;
}) {
  function pluralize(n: number) {
    return `${n} item${n === 1 ? '' : 's'}`;
  }

  const icons: Array<{ id: string; icon: string; title: string; subtitle?: string; onOpen: () => void }> = [
    { id: 'uploaded',   icon: '📁', title: 'Uploaded Files',   subtitle: pluralize(uploadedCount),  onOpen: () => onOpen('uploaded') },
    { id: 'generated',  icon: '✨', title: 'Generated Files',  subtitle: pluralize(generatedCount), onOpen: () => onOpen('generated') },
    { id: 'converter',  icon: '🔁', title: 'File Converter',   subtitle: 'PNG ⇄ JPG ⇄ WEBP',        onOpen: () => onOpen('converter') },
    { id: 'generator',  icon: '🧩', title: 'File Generator',   subtitle: 'Docgen',                  onOpen: () => onOpen('generator') },
    { id: 'interpreter',icon: '📝', title: 'File Interpreter', subtitle: 'Summarize files',         onOpen: () => onOpen('interpreter') },
    { id: 'memory',     icon: '🧠', title: 'Memory Files',     subtitle: pluralize(memoryCount),    onOpen: () => onOpen('memory') },
    ...customFolders.map((f) => ({ id: f.id, icon: '📁', title: f.name, subtitle: 'Empty', onOpen: () => onOpen(f.id) })),
    { id: 'new-folder', icon: '➕', title: 'New Folder',       subtitle: 'Create a local folder (UI)', onOpen: onNewFolder },
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
        ${selected ? 'bg-cyan-600/30 border-cyan-200' : 'bg-cyan-900/40 border-cyan-600/40 group-hover:border-cyan-400'}
        shadow-md transition`}
      >
        <div className="text-5xl">{icon}</div>
      </div>
      <div className="mt-3 text-center">
        <div className={`text-cyan-50 text-[13px] leading-4 ${selected ? 'font-semibold' : ''}`}>{title}</div>
        {subtitle && <div className="text-xs text-cyan-200 mt-0.5">{subtitle}</div>}
      </div>
    </div>
  );
}


/* ---------- Section wrapper ---------- */
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
          <div className="text-cyan-50 font-medium">{title}</div>
          {subtitle && <div className="text-[12px] text-cyan-200/90">{subtitle}</div>}
        </div>
        {right}
      </div>
      <div className="rounded-xl border border-cyan-500/40 bg-cyan-950/60 p-4">{children}</div>
    </div>
  );
}

/* ---------- File list ---------- */
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
      <div className="w-[min(520px,92vw)] rounded-2xl border border-cyan-500/40 bg-cyan-950/90 shadow-2xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <div className="text-cyan-50 font-medium">{title}</div>
          <button
            onClick={onClose}
            className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
          >
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ---------- File Converter (unchanged logic, teal styling) ---------- */
function FileConverter({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<'png' | 'jpeg' | 'webp' | 'txt' | 'csv' | 'xlsx' | 'json'>('png');
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
  if (!file || !projectId) return;
  setStatus('Uploading & converting…');
  setOutUrl(null);

  const form = new FormData();
  form.append('file', file);
  form.append('project_id', projectId);
  form.append('target_format', format);

  const res = await fetch('/functions/v1/convert-file', {
    method: 'POST',
    body: form,
  });

  const data = await res.json();

  if (!res.ok || data.error) {
    setStatus(`❌ Failed: ${data?.error || res.status}`);
    return;
  }

  setOutUrl(data.file_url);
  setStatus(`✅ Converted: ${data.file_name}`);
};


  const download = () => {
  if (!file || !outUrl) return;
  const a = document.createElement('a');
  a.href = outUrl;
  a.download = outUrl.split('/').pop() || 'converted_file';
  document.body.appendChild(a);
  a.click();
  a.remove();
};


  return (
    <div className="text-cyan-50 space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="file"
          accept="image/*,.txt,.md,.csv,.json,application/json,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={onPick}
          className="text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md file:border file:border-cyan-600/40 file:bg-cyan-900/60 file:text-cyan-50 file:hover:bg-cyan-900/80"
        />
        <div className="flex items-center gap-2">
          <label className="text-sm text-cyan-200">Convert to</label>
          <select
  value={format}
  onChange={(e) => setFormat(e.target.value as any)}
  className="bg-cyan-950/70 border border-cyan-600/40 rounded-md px-2 py-1 text-sm"
>
  <optgroup label="Image">
    <option value="png">PNG</option>
    <option value="jpeg">JPG</option>
    <option value="webp">WEBP</option>
  </optgroup>
  <optgroup label="Text">
    <option value="txt">TXT (from DOCX)</option>
  </optgroup>
  <optgroup label="Spreadsheets">
    <option value="csv">CSV (from XLSX / JSON)</option>
    <option value="xlsx">XLSX (from CSV)</option>
    <option value="json">JSON (from CSV)</option>
  </optgroup>
</select>
        </div>
        <button
          onClick={convert}
          disabled={!file}
          className="px-3 py-1.5 rounded-md border border-cyan-600 bg-cyan-700 hover:bg-cyan-600 text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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

      {status && <div className="text-xs text-cyan-200">{status}</div>}

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
      <div className="rounded-md border border-cyan-600/40 bg-cyan-950/40 p-3">
        <div className="text-cyan-200 text-xs mb-2">{title}</div>
        {src ? (
          <img ref={imgLocalRef} src={src} className="max-h-80 w-auto rounded" alt={title} />
        ) : (
          <div className="h-40 grid place-items-center text-cyan-300 text-sm italic">No preview</div>
        )}
      </div>
    );
  }
}

/* ---------- DocGen form (choose type + description) ---------- */
function DocGenForm({ projectId, onGenerated }: { projectId: string; onGenerated: () => void }) {
  const [fileType, setFileType] = useState<'markdown' | 'text' | 'csv' | 'json'>('markdown');
  const [filename, setFilename] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const suggested = (() => {
    const base = (filename || description || 'New_Document')
      .trim()
      .slice(0, 60)
      .replace(/\s+/g, '_')
      .replace(/[^\w\-.,@]/g, '');
    return base || 'New_Document';
  })();

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
          fileType, // 'markdown' | 'text' | 'csv' | 'json'
          description,
          filename: filename || suggested,
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
    <div className="text-cyan-50 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="flex items-center gap-2">
          <label className="text-sm text-cyan-200 w-24">Type</label>
          <select
            value={fileType}
            onChange={(e) => setFileType(e.target.value as any)}
            className="bg-cyan-950/70 border border-cyan-600/40 rounded-md px-2 py-1 text-sm w-full"
          >
            <option value="markdown">Markdown (.md)</option>
            <option value="text">Text (.txt)</option>
            <option value="csv">CSV (.csv)</option>
            <option value="json">JSON (.json)</option>
          </select>
        </div>

        <div className="md:col-span-2 flex items-center gap-2">
          <label className="text-sm text-cyan-200 w-24">Filename</label>
          <input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            className="bg-cyan-950/70 border border-cyan-600/40 rounded-md px-2 py-1 text-sm w-full placeholder-cyan-200/60"
            placeholder={suggested}
          />
        </div>
      </div>

      <div>
        <label className="text-sm text-cyan-200">Description</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={8}
          className="mt-2 w-full bg-cyan-950/70 border border-cyan-600/40 rounded-md p-3 text-cyan-50 text-sm leading-5 placeholder-cyan-200/60"
          placeholder="Describe the file contents (e.g., 'Weekly summary with highlights and action items')."
        />
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={generate}
          disabled={busy || !projectId}
          className="px-3 py-1.5 rounded-md border border-emerald-700 bg-emerald-600 hover:bg-emerald-500 text-white text-sm disabled:opacity-50"
        >
          {busy ? 'Generating…' : 'Generate into Generated Files'}
        </button>
        {status && <div className="text-xs text-cyan-200">{status}</div>}
      </div>
    </div>
  );
}

/* ---------- File Interpreter (placeholder) ---------- */
function FileInterpreter({ projectId }: { projectId: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const onPick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    const f = e.target.files?.[0] || null;
    setFile(f);
    setStatus(null);
    setSummary(null);
  };

  const interpret = async () => {
    if (!file) return;
    setStatus("⏳ Uploading & interpreting…");
    setSummary(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("project_id", projectId);

      const res = await fetch("/functions/v1/interpret-file", {
        method: "POST",
        body: form,
      });

      const data = await res.json();

      if (!res.ok || data.error) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setSummary(data.summary || "No summary returned.");
      setStatus(`✅ Interpreted: ${data.file_name}`);
    } catch (e: any) {
      console.error("Interpret error:", e);
      setStatus(`❌ Failed: ${e?.message ?? e}`);
    }
  };

  return (
    <div className="text-cyan-50 space-y-4">
      {/* File input + action */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <input
          type="file"
          accept=".txt,.md,.csv,.json,text/*,application/json"
          onChange={onPick}
          className="text-sm file:mr-3 file:px-3 file:py-1.5 file:rounded-md 
                     file:border file:border-cyan-600/40 file:bg-cyan-900/60 
                     file:text-cyan-50 file:hover:bg-cyan-900/80"
        />
        <button
          onClick={interpret}
          disabled={!file}
          className="px-3 py-1.5 rounded-md border border-cyan-600 bg-cyan-700 
                     hover:bg-cyan-600 text-white text-sm 
                     disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Interpret
        </button>
        {file && (
          <span className="text-xs text-cyan-200 truncate max-w-[50ch]">
            Loaded: {file.name}
          </span>
        )}
      </div>

      {/* Status */}
      {status && <div className="text-xs text-cyan-200">{status}</div>}

      {/* Result */}
      {summary && (
        <div className="rounded-md border border-cyan-600/40 bg-cyan-950/40 p-4">
          <div className="text-cyan-200 text-xs mb-2">Summary</div>
          <pre className="whitespace-pre-wrap text-sm leading-6 text-cyan-50 max-h-96 overflow-auto">
            {summary}
          </pre>
        </div>
      )}
    </div>
  );
}

/* ---------- Memory Files (fixed mapping + inline preview + DB fallback) ---------- */
function MemoryFiles({
  projectId,
  allowManualGenerate = false,
}: {
  projectId?: string;
  allowManualGenerate?: boolean;
}) {
  type Tab = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

  const TABLE_BY_TAB: Record<Tab, string> = {
    daily: 'zeta_daily_memory',
    weekly: 'zeta_weekly_memory',
    monthly: 'zeta_monthly_memory',
    quarterly: 'zeta_quarterly_memory',
    annual: 'zeta_annual_memory',
  };

  const bucket = 'memory';
  const [tab, setTab] = React.useState<Tab>('daily');
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);

  const [files, setFiles] = React.useState<
    {
      name: string;
      url: string;
      path: string;
      exists: boolean;
      label: string;
      date: string;
      dbMemory: string | null; // <-- for DB fallback preview
    }[]
  >([]);

  // preview modal state
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewTitle, setPreviewTitle] = React.useState<string>('');
  const [previewText, setPreviewText] = React.useState<string | null>(null);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

  function quarterFromDateStr(dateStr: string) {
    const m = Number((dateStr.split('-')[1] ?? '1'));
    return Math.max(1, Math.min(4, Math.floor((m - 1) / 3) + 1));
  }
  function makeFileName(t: Tab, dateStr: string) {
    switch (t) {
      case 'daily': return `memory-${dateStr}.txt`;
      case 'weekly': return `memory-week-${dateStr}.txt`;
      case 'monthly': return `memory-${dateStr.slice(0, 7)}.txt`;
      case 'quarterly': return `memory-${dateStr.slice(0, 4)}-Q${quarterFromDateStr(dateStr)}.txt`;
      case 'annual': return `memory-${dateStr.slice(0, 4)}.txt`;
    }
  }
  function labelFor(t: Tab, dateStr: string) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(d.getTime())) return dateStr;
    switch (t) {
      case 'daily':
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      case 'weekly':
        return `Week of ${d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}`;
      case 'monthly':
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long' });
      case 'quarterly':
        return `Q${quarterFromDateStr(dateStr)} ${dateStr.slice(0, 4)}`;
      case 'annual':
        return dateStr.slice(0, 4);
    }
  }

  async function fetchRows(projectId: string, t: Tab) {
    const { data: { user } } = await supabase.auth.getUser();
    const table = TABLE_BY_TAB[t];
    let q = supabase
      .from(table)
      .select('date,memory')
      .eq('project_id', projectId)
      .order('date', { ascending: false })
      .limit(100);
    if (user?.id) q = q.eq('user_id', user.id);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as { date: string; memory: string | null }[];
  }

  async function listStorageNames(prefix: string) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 400, sortBy: { column: 'name', order: 'desc' } });
    if (error) return new Set<string>();
    const set = new Set<string>();
    for (const f of data ?? []) if (typeof f?.name === 'string') set.add(f.name);
    return set;
  }

  async function refresh() {
    if (!projectId) return;
    setErr(null);
    setLoading(true);
    try {
      // 1) Get DB rows (returned directly to avoid state race)
      const rows = (await fetchRows(projectId, tab)).filter((r) => !!r?.date);

      // 2) Build index of existing storage files
      const subfolderNames = await listStorageNames(`${projectId}/${tab}/`);
      // legacy daily path (pre-subfolders)
      const legacyDailyNames = tab === 'daily' ? await listStorageNames(`${projectId}/`) : new Set<string>();

      // 3) Map to UI items
      const mapped = rows.map((r) => {
        const fname = makeFileName(tab, r.date);
        const structuredPath = `${projectId}/${tab}/${fname}`;
        const legacyPath = `${projectId}/${fname}`;
        const usingLegacy = tab === 'daily' && !subfolderNames.has(fname) && legacyDailyNames.has(fname);
        const exists = usingLegacy ? legacyDailyNames.has(fname) : subfolderNames.has(fname);
        const path = usingLegacy ? legacyPath : structuredPath;
        const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;

        return {
          name: fname,
          url,
          path,
          exists,
          label: labelFor(tab, r.date),
          date: r.date,
          dbMemory: r.memory ?? null,
        };
      });

      setFiles(mapped);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load memory');
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tab]);

  async function generateToday() {
    if (!projectId) return;
    setLoading(true);
    setErr(null);
    try {
      const base = process.env.NEXT_PUBLIC_MEMORY_EDGE_URL || '/functions/v1/create-memory-file';
      const res = await fetch(`${base}?project_id=${encodeURIComponent(projectId)}`, { method: 'POST' });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Generate failed (${res.status}) ${text}`.trim());
      }
      await refresh();
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to generate memory file');
      setLoading(false);
    }
  }

  // ---- inline preview
  async function openPreviewFromFile(file: { name: string; path: string }) {
    setPreviewTitle(file.name);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewText(null);

    try {
      const { data, error } = await supabase.storage.from(bucket).download(file.path);
      if (error) throw error;
      const text = await data.text();
      setPreviewText(text);
    } catch (e: any) {
      setPreviewError(e?.message ?? 'Failed to load file');
    } finally {
      setPreviewLoading(false);
    }
  }
  function openPreviewFromDB(item: { name: string; dbMemory: string | null }) {
    setPreviewTitle(item.name);
    setPreviewOpen(true);
    setPreviewLoading(false);
    setPreviewError(null);
    setPreviewText(item.dbMemory || '(no text in DB row)');
  }
  async function copyPreview() {
    if (previewText) {
      try { await navigator.clipboard.writeText(previewText); } catch {}
    }
  }

  if (!projectId) {
    return <div className="text-cyan-50"><p className="text-sm text-cyan-200 mb-3">Select a project to view memory files.</p></div>;
  }

  const memPanelBase = `/dashboard/${projectId}/intelligence`;

  return (
    <div className="text-cyan-50">
      {/* Tabs */}
      <div className="mb-3 flex items-center gap-2">
        {(['daily','weekly','monthly','quarterly','annual'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize border ${
              tab === t ? 'bg-cyan-200 text-cyan-900 border-cyan-300' : 'bg-cyan-900/40 text-cyan-100 border-cyan-600/40 hover:bg-cyan-900/60'
            }`}
          >
            {t}
          </button>
        ))}

        <div className="ml-auto flex gap-2">
          <a
            href={`${memPanelBase}?memtab=${tab}`}
            className="text-xs px-2 py-1 rounded-md border border-emerald-500/60 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-100"
            title="Open CurrentMemory panel at this tab"
          >
            Open in Memory view
          </a>
          <button
            onClick={refresh}
            className="text-xs px-2 py-1 rounded-md border border-cyan-400/50 bg-cyan-900/40 hover:bg-cyan-900/60"
          >
            Refresh
          </button>
          {allowManualGenerate && tab === 'daily' && (
            <button
              onClick={generateToday}
              className="text-xs px-2 py-1 rounded-md border border-amber-400/60 bg-amber-600/20 hover:bg-amber-600/30 text-amber-100"
            >
              Generate today
            </button>
          )}
        </div>
      </div>

      {err && (
        <div className="mb-3 rounded-lg border border-red-400/70 bg-red-900/40 p-2 text-xs text-red-100">{err}</div>
      )}

      {loading ? (
        <ul className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="animate-pulse h-12 rounded-lg border border-cyan-500/30 bg-cyan-900/20" />
          ))}
        </ul>
      ) : files.length ? (
        <ul className="space-y-2">
          {files.map((f) => (
            <li key={`${tab}:${f.name}`} className="flex items-center justify-between gap-3 rounded-lg border border-cyan-500/40 bg-cyan-900/30 p-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xl">🧠</span>
                <div className="min-w-0">
                  <div className="truncate">{f.name}</div>
                  <div className="text-[11px] text-cyan-200/80">{f.label}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {f.exists ? (
                  <>
                    <button
                      onClick={() => openPreviewFromFile({ name: f.name, path: f.path })}
                      className="text-xs px-2 py-1 rounded border border-cyan-400/40 hover:bg-cyan-900/50"
                      title="Preview in panel"
                    >
                      preview
                    </button>
                    <a href={f.url} target="_blank" rel="noreferrer" className="text-xs underline text-cyan-200 hover:text-cyan-100">
                      open
                    </a>
                  </>
                ) : (
                  <>
                    <span className="text-[11px] px-2 py-0.5 rounded border border-yellow-400/50 bg-yellow-400/10 text-yellow-100">
                      missing file
                    </span>
                    {f.dbMemory && (
                      <button
                        onClick={() => openPreviewFromDB({ name: f.name, dbMemory: f.dbMemory })}
                        className="text-[11px] px-2 py-1 rounded border border-cyan-400/40 hover:bg-cyan-900/50"
                        title="Show text from DB row"
                      >
                        view from DB
                      </button>
                    )}
                  </>
                )}
                
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-lg border border-cyan-500/30 bg-cyan-900/20 p-4 text-sm text-cyan-200">
          No {tab} memory files found yet.
        </div>
      )}

      {/* Inline preview modal */}
      <Modal open={previewOpen} title={previewTitle} onClose={() => setPreviewOpen(false)}>
        <div className="space-y-3">
          {previewLoading && <div className="text-xs text-cyan-200">Loading…</div>}
          {previewError && <div className="text-xs text-red-200">❌ {previewError}</div>}
          {previewText && (
            <>
              <div className="flex justify-end">
                <button
                  onClick={copyPreview}
                  className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
                >
                  Copy text
                </button>
              </div>
              <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap text-xs leading-5 text-cyan-50 bg-cyan-950/60 rounded-md p-3 border border-cyan-600/30">
                {previewText}
              </pre>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}


