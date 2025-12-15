'use client';

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { createPortal } from 'react-dom';
import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useParams } from 'next/navigation';

// Split views
import UploadedView from './Icons/UploadedView';
import GeneratedView from './Icons/GeneratedView';
import ConverterView from './Icons/ConverterView';
import GeneratorView from './Icons/GeneratorView';
import InterpreterView from './Icons/InterpreterView';
import MemoryView from './Icons/MemoryView';
import { SectionCard } from './Icons/common';
import DataCenterView from './Icons/DataCenterView';


/* ─────────────────────────────────────────────────────────
   Types + helpers
────────────────────────────────────────────────────────── */
export type FileDoc = {
  file_url: string;
  file_name: string;
  created_at?: string | null;
  created_by?: 'user' | 'zeta' | null;
  storage_key?: string;
};

type BuiltInFolder =
  | 'uploaded'
  | 'generated'
  | 'converter'
  | 'generator'
  | 'interpreter'
  | 'memory'
  | 'datacenter';

type FolderId = BuiltInFolder | `custom:${string}`;

type CustomFolder = { id: `custom:${string}`; name: string };

type Plan = 'loading' | 'free' | 'premium' | 'pro';

function normalizePlanValue(raw: any): Plan {
  const v = String(raw ?? '').trim().toLowerCase();
  if (!v) return 'free';
  if (v === 'pro') return 'pro';
  if (['premium', 'plus', 'paid', 'trial_premium'].includes(v)) return 'premium';
  return 'free';
}


/** remove a single outer ``` fenced block if present */
function stripOuterFences(text: string) {
  const fence = /^\s*```[\w-]*\s*\n([\s\S]*?)\n\s*```\s*$/;
  const m = text.match(fence);
  return m ? m[1] : text;
}

/** remove common leading indentation across non-empty lines */
function deindentBlock(text: string) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let i = 0,
    j = lines.length - 1;
  while (i <= j && !lines[i].trim()) i++;
  while (j >= i && !lines[j].trim()) j--;
  const slice = lines.slice(i, j + 1);
  if (!slice.length) return text.trim();

  let min = Infinity;
  for (const ln of slice) {
    if (!ln.trim()) continue;
    const m = ln.match(/^(?:[ \t]+)/);
    const indent = m ? m[0].replace(/\t/g, '    ').length : 0;
    min = Math.min(min, indent);
  }
  if (!isFinite(min) || min === 0) return text.trimEnd();

  const out = lines.map((ln) => {
    if (!ln.trim()) return '';
    const expanded = ln.replace(/\t/g, '    ');
    return expanded.slice(Math.min(min, expanded.length));
  });

  return out.join('\n').trimEnd();
}

function normalizeMarkdownText(text: string) {
  return deindentBlock(stripOuterFences(text));
}

function titleFor(view: FolderId | null, customFolders: CustomFolder[]) {
  if (!view) return 'Files';
  if (view === 'uploaded') return 'Uploaded Files';
  if (view === 'generated') return 'Generated Files';
  if (view === 'converter') return 'File Converter';
  if (view === 'generator') return 'File Generator';
  if (view === 'interpreter') return 'File Interpreter';
  if (view === 'memory') return 'Memory Files';
  if (view === 'datacenter') return 'Data Center';

  if (view.startsWith('custom:')) {
    return customFolders.find((f) => f.id === view)?.name || 'Folder';
  }
  return 'Files';
}


function downloadUrl(url: string, fallbackName = 'download') {
  const a = document.createElement('a');
  a.href = url;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const isTextLike = (name: string) =>
  /\.(md|markdown|txt|csv|json)$/i.test(name || '');

/* ─────────────────────────────────────────────────────────
   Markdown components
────────────────────────────────────────────────────────── */
function ParagraphSmart({
  children,
  className = 'text-cyan-50/90 my-2',
  ...props
}: React.ComponentProps<'p'>) {
  const hasBlockChild = React.Children.toArray(children).some((child) => {
    if (!React.isValidElement(child)) return false;
    const el = child as React.ReactElement<any>;
    const type = el.type as any;
    const isPre =
      type === 'pre' || (typeof type === 'string' && type.toLowerCase() === 'pre');
    const cls =
      typeof el.props?.className === 'string' ? el.props.className : '';
    const childText =
      typeof el.props?.children === 'string'
        ? el.props.children
        : Array.isArray(el.props?.children)
        ? el.props.children.join('')
        : '';
    const looksBlockyCode =
      /(^|\s)language-/.test(cls) || /\r?\n/.test(childText);
    return isPre || looksBlockyCode;
  });

  const Comp: any = hasBlockChild ? 'div' : 'p';
  return (
    <Comp className={className} {...props}>
      {children}
    </Comp>
  );
}

const mdComponents: Components = {
  h1: ({ node, ...props }) => (
    <h1 className="text-cyan-50 text-2xl font-semibold mb-3" {...props} />
  ),
  h2: ({ node, ...props }) => (
    <h2 className="text-cyan-50 text-xl font-semibold mt-5 mb-2" {...props} />
  ),
  h3: ({ node, ...props }) => (
    <h3 className="text-cyan-50 text-lg font-semibold mt-4 mb-1.5" {...props} />
  ),
  p: (props: any) => <ParagraphSmart {...props} />,
  ul: ({ node, ...props }) => (
    <ul
      className="list-disc pl-5 my-2 space-y-1 marker:text-cyan-300"
      {...props}
    />
  ),
  ol: ({ node, ...props }) => (
    <ol
      className="list-decimal pl-5 my-2 space-y-1 marker:text-cyan-300"
      {...props}
    />
  ),
  li: ({ node, ...props }) => (
    <li className="text-cyan-50/90" {...props} />
  ),
  em: ({ node, ...props }) => (
    <em className="text-cyan-100/90" {...props} />
  ),
  strong: ({ node, ...props }) => (
    <strong className="text-cyan-50" {...props} />
  ),
  blockquote: ({ node, ...props }) => (
    <blockquote
      className="border-l-2 border-cyan-500/50 pl-3 my-3 text-cyan-100/80 italic"
      {...props}
    />
  ),
  hr: () => <hr className="my-4 border-cyan-600/40" />,
  code: (props) => {
    const { inline, className, children, ...rest } = props as {
      inline?: boolean;
      className?: string;
      children?: React.ReactNode;
    };
    const text =
      typeof children === 'string'
        ? children
        : Array.isArray(children)
        ? children.join('')
        : String(children ?? '');
    const hasLang = /(^|\s)language-/.test(className || '');
    const hasNewline = /\r?\n/.test(text);
    const isBlock = Boolean(!inline && (hasLang || hasNewline));
    if (!isBlock) {
      return (
        <code
          className="px-1 py-0.5 rounded bg-cyan-900/60 border border-cyan-700/50 text-cyan-100 text-[12px]"
          {...rest}
        >
          {children}
        </code>
      );
    }
    return (
      <pre className="overflow-auto rounded-md border border-cyan-700/50 bg-cyan-900/50 p-3 text-[12px] leading-5 text-cyan-100">
        <code className={className}>{children}</code>
      </pre>
    );
  },
};

/* ─────────────────────────────────────────────────────────
   Modal primitives
────────────────────────────────────────────────────────── */
function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

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
    <ModalPortal>
      <div
        className="fixed inset-0 z-[2147483647] grid place-items-center bg-black/55 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-[min(720px,92vw)] max-h-[85vh] rounded-2xl border border-cyan-500/40 bg-cyan-950/90 shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-cyan-600/40 bg-cyan-950/90 sticky top-0">
            <div className="text-cyan-50 font-medium truncate pr-3">
              {title}
            </div>
            <button
              onClick={onClose}
              className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
            >
              Close
            </button>
          </div>
          <div className="p-5 overflow-auto max-h-[calc(85vh-52px)] pr-2">
            {children}
          </div>
        </div>
      </div>
    </ModalPortal>
  );
}

/* ─────────────────────────────────────────────────────────
   Error Boundary (for inner views)
────────────────────────────────────────────────────────── */
class ViewErrorBoundary extends React.Component<
  { children: React.ReactNode; label: string },
  { hasError: boolean; message?: string }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, message: undefined };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: err?.message ?? String(err) };
  }
  componentDidCatch(err: any) {
    // eslint-disable-next-line no-console
    console.error(`[FilesPanel:${this.props.label}] crashed`, err);
  }
  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <SectionCard
        title={`${this.props.label} crashed`}
        subtitle="Something went wrong"
      >
        <div className="text-red-200 text-sm">
          {this.state.message || 'Unknown error.'}
        </div>
      </SectionCard>
    );
  }
}

/* ─────────────────────────────────────────────────────────
   Paywall UI
────────────────────────────────────────────────────────── */
function Paywall({
  feature,
  onUpgrade,
}: {
  feature: 'interpreter' | 'converter';
  onUpgrade: () => void;
}) {
  const label = feature === 'interpreter' ? 'File Interpreter' : 'File Converter';
  return (
    <SectionCard
      title={`${label} — Premium`}
      subtitle="Unlock with Zeta Pro"
      right={
        <button
          onClick={onUpgrade}
          className="text-xs px-2 py-1 rounded-md border border-amber-500/70 bg-amber-500/20 hover:bg-amber-500/30 text-amber-100"
        >
          Upgrade
        </button>
      }
    >
      <div className="text-cyan-50/95 space-y-3">
        <div className="flex items-center gap-2 text-amber-200">
          <span className="text-lg">🔒</span>
          <span>This feature is available on the Premium plan.</span>
        </div>
        <ul className="list-disc pl-5 text-cyan-100/90 space-y-1">
          <li>AI summaries &amp; insights on your files</li>
          <li>Fast, reliable conversions (PNG ⇄ JPG ⇄ WEBP, +more)</li>
          <li>Higher limits and priority compute</li>
        </ul>
        <div className="pt-2">
          <button
            onClick={onUpgrade}
            className="px-3 py-1.5 rounded-md border border-amber-500 bg-amber-500 text-indigo-900 font-semibold text-sm hover:opacity-90"
          >
            Upgrade to Premium
          </button>
        </div>
      </div>
    </SectionCard>
  );
}

/* ╔════════════════════════════════════════════════════════╗
   ║                     MAIN COMPONENT                     ║
   ╚════════════════════════════════════════════════════════╝ */
export default function FilesPanel({
  projectId: projectIdProp,
  fontSize,
  recentDocs = [],
}: {
  projectId?: string;
  fontSize: 'sm' | 'base' | 'lg';
  recentDocs?: FileDoc[];
}) {
  const params = useParams() as Record<string, string | string[] | undefined> | null;
  const [projectId, setProjectId] = useState<string | null>(projectIdProp ?? null);

  // documents state
  const [docs, setDocs] = useState<FileDoc[]>(recentDocs);
  const [genDocs, setGenDocs] = useState<FileDoc[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingGen, setLoadingGen] = useState(false);
  const [memoryCount, setMemoryCount] = useState(0);

  const [view, setView] = useState<FolderId | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  // plan / premium gating
  const [plan, setPlan] = useState<Plan>('loading');
  const isPremium = plan === 'premium' || plan === 'pro';
  const isFree = plan === 'free';
  const [showPaywall, setShowPaywall] = useState<false | 'interpreter' | 'converter'>(
    false,
  );

  // Generated file preview
  const [genPreviewOpen, setGenPreviewOpen] = useState(false);
  const [genPreviewTitle, setGenPreviewTitle] = useState('');
  const [genPreviewUrl, setGenPreviewUrl] = useState<string | null>(null);
  const [genPreviewText, setGenPreviewText] = useState<string | null>(null);
  const [genPreviewLoading, setGenPreviewLoading] = useState(false);
  const [genPreviewError, setGenPreviewError] = useState<string | null>(null);

  const textSize =
    fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-base';

  useEffect(() => setDocs(recentDocs), [recentDocs]);

  // safe param getter
  const getParam = (key: string): string | null => {
    if (!params) return null;
    const raw = params[key];
    if (!raw) return null;
    if (Array.isArray(raw)) return raw[0] ?? null;
    return raw;
  };

  // resolve projectId: props → URL params → query
  useEffect(() => {
    if (projectIdProp) {
      setProjectId(projectIdProp);
      return;
    }

    try {
      const fromParams =
        getParam('projectId') ?? getParam('id') ?? getParam('pid') ?? null;

      let fromQuery: string | null = null;
      if (typeof window !== 'undefined') {
        const sp = new URLSearchParams(window.location.search);
        fromQuery = sp.get('projectId');
      }

      const finalId = (fromParams || fromQuery || '').trim();
      if (finalId) setProjectId(finalId);
    } catch (err) {
      console.warn('[FilesPanel] projectId resolution error:', err);
    }
  }, [projectIdProp, params]);

  // DEV override (?forcePremium=1 or localStorage flag)
  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const sp = new URLSearchParams(window.location.search);
      const force =
        sp.get('forcePremium') === '1' ||
        (typeof localStorage !== 'undefined' &&
          localStorage.getItem('zeta_force_premium') === '1');
      if (force) setPlan('premium');
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch plan strictly from mainframe_info.plan by project_id
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!projectId) {
        if (!cancelled) setPlan('loading');
        return;
      }
      try {
        const { data, error } = await supabase
          .from('mainframe_info')
          .select('plan')
          .eq('project_id', projectId)
          .maybeSingle();

        if (error) {
          console.warn('[FilesPanel] mainframe_info plan error:', error);
          if (!cancelled) setPlan('free');
          return;
        }
        if (!data) {
          console.warn(
            '[FilesPanel] no mainframe_info row for project',
            projectId,
          );
          if (!cancelled) setPlan('free');
          return;
        }
        const p = normalizePlanValue(data?.plan);
        if (!cancelled) setPlan(p);
      } catch (e) {
        console.warn('[FilesPanel] plan fetch exception:', e);
        if (!cancelled) setPlan('free');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // close paywall if plan flips to premium
  useEffect(() => {
    if (isPremium && showPaywall) setShowPaywall(false);
  }, [isPremium, showPaywall]);

  // helpers for Supabase storage
  const toStoragePath = (urlOrPath: string) => {
    if (!urlOrPath) return '';
    if (urlOrPath.startsWith('http')) {
      const markerA = '/object/public/project-docs/';
      const markerB = '/storage/v1/object/public/project-docs/';
      const iA = urlOrPath.indexOf(markerA);
      const iB = urlOrPath.indexOf(markerB);
      if (iA >= 0) return urlOrPath.slice(iA + markerA.length);
      if (iB >= 0) return urlOrPath.slice(iB + markerB.length);
      return urlOrPath;
    }
    return urlOrPath;
  };

  const publicUrlForPath = (path: string) =>
    supabase.storage.from('project-docs').getPublicUrl(path).data.publicUrl;

  // ───────── Data loads ─────────
  async function loadDocs() {
    if (!projectId) {
      setDocs([]);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `/api/project-files?project_id=${encodeURIComponent(
          projectId,
        )}&limit=100`,
      );
      const json = await res.json().catch(() => ({}));
      const rows = (json as any).rows ?? [];
      const list: FileDoc[] = rows.map((r: any) => ({
        file_name: r.file_name,
        file_url: r.file_url,
        storage_key: r.storage_key ?? undefined,
        created_at: r.created_at ?? null,
        created_by: (r.created_by as 'user' | 'zeta' | null) ?? 'user',
      }));
      setDocs(list);
    } catch (e) {
      console.warn('loadDocs error:', e);
      setDocs([]);
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
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      let q = supabase
        .from('zeta_daily_memory')
        .select('*', { count: 'exact', head: true })
        .eq('project_id', projectId);
      if (userId) q = q.eq('user_id', userId);
      const { count } = await q;
      setMemoryCount(count || 0);
    } catch {
      setMemoryCount(0);
    }
  }

  async function loadGenerated() {
    if (!projectId) {
      setGenDocs([]);
      return;
    }
    setLoadingGen(true);
    try {
      const { data: items, error } = await supabase.storage
        .from('project-docs')
        .list(`${projectId}/generated`, {
          limit: 1000,
          sortBy: { column: 'name', order: 'desc' },
        });

      if (error?.message?.includes('does not exist')) {
        setGenDocs([]);
        return;
      }

      const list: FileDoc[] = (items || [])
        .map((it) => {
          const ext = it.name.split('.').pop()?.toLowerCase();
          const ok =
            ext &&
            [
              'png',
              'jpg',
              'jpeg',
              'webp',
              'pdf',
              'md',
              'markdown',
              'txt',
              'csv',
              'json',
            ].includes(ext);
          if (!ok) return null;
          return {
            file_name: it.name,
            file_url: publicUrlForPath(`${projectId}/generated/${it.name}`),
            created_at: null,
            created_by: 'zeta' as const,
          };
        })
        .filter(Boolean) as FileDoc[];
      setGenDocs(list);
    } catch (e) {
      console.warn('loadGenerated error:', e);
      setGenDocs([]);
    } finally {
      setLoadingGen(false);
    }
  }

  // ───────── Custom folders ─────────
  const [customFolders, setCustomFolders] = useState<CustomFolder[]>([]);
  const storageKey = `filespanel:folders:${projectId ?? 'none'}`;

  useEffect(() => {
    (async () => {
      try {
        if (!projectId) return;
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) {
          setCustomFolders([]);
          return;
        }

        const { data, error } = await supabase
          .from('created_folders')
          .select('id,name,created_at')
          .eq('project_id', projectId)
          .eq('user_id', userId)
          .order('created_at', { ascending: true });

        if (error) throw error;

        const rows =
          data?.map((r) => ({ id: `custom:${r.id}` as const, name: r.name })) ??
          [];
        setCustomFolders(rows);
        try {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(storageKey, JSON.stringify(rows));
          }
        } catch {
          /* ignore */
        }
      } catch (e) {
        console.warn('[FilesPanel] custom folders fetch failed, using cache:', e);
        try {
          if (typeof localStorage === 'undefined') {
            setCustomFolders([]);
            return;
          }
          const raw = localStorage.getItem(storageKey);
          const cached = raw ? (JSON.parse(raw) as CustomFolder[]) : [];
          setCustomFolders(cached);
        } catch {
          setCustomFolders([]);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    try {
      if (projectId && typeof localStorage !== 'undefined') {
        localStorage.setItem(storageKey, JSON.stringify(customFolders));
      }
    } catch {
      /* ignore */
    }
  }, [customFolders, projectId, storageKey]);

  // initial loads once we have a projectId
  useEffect(() => {
    if (!projectId) return;
    loadDocs();
    loadGenerated();
    loadMemoryCount();
  }, [projectId]);

  // live updates for documents table
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
        () => {
          loadDocs();
          loadGenerated();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId]);

  // Delete from storage AND DB so it doesn't come back.
  const handleDelete = async (doc: FileDoc) => {
    if (!projectId) return;
    if (!confirm(`Delete "${doc.file_name}"? This can’t be undone.`)) return;
    setBusy(doc.file_url || doc.file_name);
    try {
      const body = {
        project_id: projectId,
        storage_key: doc.storage_key ?? null,
        file_url: doc.file_url ?? null,
        file_name: doc.file_name ?? null,
      };

      const res = await fetch('/api/documentupload', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok || (payload as any)?.error) {
        throw new Error((payload as any)?.error || `HTTP ${res.status}`);
      }

      await loadDocs();
    } catch (err: any) {
      alert(`Delete failed: ${err?.message ?? err}`);
    } finally {
      setBusy(null);
    }
  };

  // Folders modal helpers
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renameFolderId, setRenameFolderId] =
    useState<`custom:${string}` | null>(null);
  const [renameName, setRenameName] = useState('');

  const openFolderModal = () => {
    setNewFolderName('');
    setShowFolderModal(true);
  };

  const createFolder = async () => {
    if (!projectId) return;
    const name = newFolderName.trim();
    if (!name) return;

    const { data: auth } = await supabase.auth.getUser();
    const userId = auth?.user?.id;
    if (!userId) {
      alert('Not signed in.');
      return;
    }

    const tempId = `custom:temp-${Date.now().toString(36)}` as const;
    setCustomFolders((f) => [...f, { id: tempId, name }]);
    setShowFolderModal(false);
    setNewFolderName('');
    setView(tempId);

    try {
      const { data, error } = await supabase
        .from('created_folders')
        .insert({ project_id: projectId, user_id: userId, name })
        .select('id,name')
        .single();
      if (error) throw error;

      const realId = `custom:${data.id}` as const;
      setCustomFolders((prev) =>
        prev.map((f) => (f.id === tempId ? { id: realId, name: data.name } : f)),
      );
      if (view === tempId) setView(realId);
    } catch (e: any) {
      setCustomFolders((prev) => prev.filter((f) => f.id !== tempId));
      if (view === tempId) setView(null);
      alert(`Failed to create folder: ${e?.message ?? e}`);
    }
  };

  const getCustomName = (id: `custom:${string}`) =>
    customFolders.find((f) => f.id === id)?.name ?? 'Folder';

  function deleteCustomFolder(id: `custom:${string}`) {
    if (!projectId) return;
    const name = getCustomName(id);
    if (
      !confirm(
        `Delete folder "${name}"? This only removes the UI folder (not your files).`,
      )
    )
      return;

    const uuid = id.replace('custom:', '');
    const prev = customFolders;
    setCustomFolders(prev.filter((f) => f.id !== id));
    if (view === id) setView(null);

    (async () => {
      try {
        const { data: auth } = await supabase.auth.getUser();
        const userId = auth?.user?.id;
        if (!userId) throw new Error('Not signed in');

        const { error } = await supabase
          .from('created_folders')
          .delete()
          .eq('id', uuid)
          .eq('project_id', projectId)
          .eq('user_id', userId);
        if (error) throw error;
      } catch (e: any) {
        setCustomFolders(prev);
        alert(`Delete failed: ${e?.message ?? e}`);
      }
    })();
  }

  function openRenameModal(id: `custom:${string}`) {
    setRenameFolderId(id);
    setRenameName(getCustomName(id));
    setShowRenameModal(true);
  }
  async function submitRename() {
    if (!projectId) return;
    const id = renameFolderId;
    const next = renameName.trim();
    if (!id || !next) {
      setShowRenameModal(false);
      return;
    }

    const uuid = id.replace('custom:', '');
    const prevName = getCustomName(id);
    setCustomFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, name: next } : f)),
    );
    setShowRenameModal(false);

    try {
      const { data: auth } = await supabase.auth.getUser();
      const userId = auth?.user?.id;
      if (!userId) throw new Error('Not signed in');

      const { error } = await supabase
        .from('created_folders')
        .update({ name: next })
        .eq('id', uuid)
        .eq('project_id', projectId)
        .eq('user_id', userId);
      if (error) throw error;
    } catch (e: any) {
      setCustomFolders((prev) =>
        prev.map((f) => (f.id === id ? { ...f, name: prevName } : f)),
      );
      alert(`Rename failed: ${e?.message ?? e}`);
    }
  }

  async function openGeneratedPreview(doc: FileDoc) {
    if (!projectId) return;
    setGenPreviewTitle(doc.file_name);
    setGenPreviewUrl(doc.file_url || null);
    setGenPreviewText(null);
    setGenPreviewError(null);
    setGenPreviewOpen(true);
    setGenPreviewLoading(true);
    try {
      if (isTextLike(doc.file_name)) {
        const storagePath =
          toStoragePath(doc.file_url) || `${projectId}/generated/${doc.file_name}`;
        const { data, error } = await supabase.storage
          .from('project-docs')
          .download(storagePath);
        if (error) throw error;

        const rawText = await data.text();
        const normalizedText = normalizeMarkdownText(rawText);
        setGenPreviewText(normalizedText);
      }
    } catch (e: any) {
      setGenPreviewError(e?.message ?? 'Failed to preview file');
    } finally {
      setGenPreviewLoading(false);
    }
  }

  const title = titleFor(view, customFolders);
  const handleOpenView = (v: FolderId) => {
    if ((v === 'interpreter' || v === 'converter') && isFree) {
      setShowPaywall(v);
      return;
    }
    setView(v);
  };

  /* If we *still* don't have a projectId, show hint UI instead of blank */
  if (!projectId) {
    return (
      <div className={`relative h-full min-h-[320px] ${textSize}`}>
        <div className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_20%_0%,rgba(125,211,252,0.10),transparent_60%),radial-gradient(50rem_30rem_at_80%_20%,rgba(20,184,166,0.12),transparent_55%),linear-gradient(180deg,#063750_0%,#053244_70%,#042836_100%)]" />
        <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px] opacity-40" />
        <div className="relative z-10 p-6 text-cyan-100">
          <div className="text-sm opacity-90">No project selected.</div>
          <div className="text-xs opacity-70 mt-1">
            I tried props, route params and <code>?projectId=</code> and couldn’t
            find a value.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full min-h-[520px] ${textSize}`}>
      {/* wallpaper */}
      <div className="absolute inset-0 bg-[radial-gradient(60rem_40rem_at_20%_0%,rgba(125,211,252,0.10),transparent_60%),radial-gradient(50rem_30rem_at_80%_20%,rgba(20,184,166,0.12),transparent_55%),linear-gradient(180deg,#063750_0%,#053244_70%,#042836_100%)]" />
      <div className="absolute inset-0 pointer-events-none [background:radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:22px_22px] opacity-40" />

      {/* top bar */}
      <div className="relative z-10 h-10 bg-cyan-900/40 backdrop-blur border-b border-cyan-500/30 flex items-center justify-between px-3 text-cyan-100">
        <div className="flex items-center gap-3">
          <span className="text-xs uppercase tracking-wider">Files</span>
          <span className="text-[10px] text-cyan-200/90">
            {view ? `Desktop / ${title}` : 'Desktop'}
          </span>
        </div>
        {view && (
          <button
            onClick={() => setView(null)}
            className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
          >
            ← Back
          </button>
        )}
      </div>

      {/* content */}
      <div
        className="relative z-10 pt-6 pb-10 px-6"
        onClick={(e) => {
          if (e.currentTarget === e.target) setSelected(null);
        }}
      >
        {view === null && (
          <DesktopGrid
            uploadedCount={docs.length}
            generatedCount={genDocs.length}
            memoryCount={memoryCount}
            customFolders={customFolders}
            selectedId={selected}
            setSelected={setSelected}
            onOpen={handleOpenView}
            onNewFolder={() => openFolderModal()}
            onDeleteFolder={(id) => deleteCustomFolder(id)}
            onRenameFolder={(id) => openRenameModal(id)}
            isPremium={isPremium}
            plan={plan}
            onShowPaywall={(f) => setShowPaywall(f)}
          />
        )}

        {view === 'uploaded' && (
          <ViewErrorBoundary label="Uploaded Files">
            <UploadedView
              projectId={projectId}
              docs={docs}
              loading={loading}
              onRefresh={loadDocs}
              onDelete={handleDelete}
              busyUrl={busy}
            />
          </ViewErrorBoundary>
        )}

        {view === 'generated' && (
          <ViewErrorBoundary label="Generated Files">
            <GeneratedView
              docs={genDocs}
              loading={loadingGen}
              onRefresh={loadGenerated}
              onDelete={handleDelete}
              busyUrl={busy}
              onPreview={openGeneratedPreview}
            />
          </ViewErrorBoundary>
        )}

        {/* Premium-gated views */}
        {view === 'converter' &&
          (isFree ? (
            <Paywall
              feature="converter"
              onUpgrade={() => (window.location.href = '/billing')}
            />
          ) : (
            <ViewErrorBoundary label="File Converter">
              <ConverterView projectId={projectId} />
            </ViewErrorBoundary>
          ))}

        {view === 'generator' && (
          <ViewErrorBoundary label="File Generator">
            <GeneratorView projectId={projectId} onGenerated={loadGenerated} />
          </ViewErrorBoundary>
        )}
{view === 'datacenter' && (
  <ViewErrorBoundary label="Data Center">
    <DataCenterView projectId={projectId} />
  </ViewErrorBoundary>
)}

        {view === 'interpreter' &&
          (isFree ? (
            <Paywall
              feature="interpreter"
              onUpgrade={() => (window.location.href = '/billing')}
            />
          ) : (
            <ViewErrorBoundary label="File Interpreter">
              <InterpreterView projectId={projectId} />
            </ViewErrorBoundary>
          ))}

        {view === 'memory' && (
          <ViewErrorBoundary label="Memory Files">
            <MemoryView projectId={projectId} />
          </ViewErrorBoundary>
        )}

        {view?.startsWith('custom:') && (
          <SectionCard
            title={titleFor(view, customFolders)}
            subtitle="UI-only folder"
            right={
              <div className="flex gap-2">
                <button
                  onClick={() => openRenameModal(view as `custom:${string}`)}
                  className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
                >
                  Rename folder
                </button>
                <button
                  onClick={() => deleteCustomFolder(view as `custom:${string}`)}
                  className="text-xs px-2 py-1 rounded-md border border-rose-700 bg-rose-600/90 hover:bg-rose-600 text-white"
                >
                  Delete folder
                </button>
              </div>
            }
          >
            <p className="text-cyan-200/90 italic">
              This folder is empty (UI only).
            </p>
          </SectionCard>
        )}
      </div>

      {/* New Folder modal */}
      <Modal
        open={showFolderModal}
        title="Create New Folder"
        onClose={() => setShowFolderModal(false)}
      >
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
              className="text-xs px-3 py-1.5 rounded-md border border-emerald-700 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              disabled={!newFolderName.trim()}
            >
              Create
            </button>
          </div>
        </div>
      </Modal>

      {/* Rename Folder modal */}
      <Modal
        open={showRenameModal}
        title="Rename Folder"
        onClose={() => setShowRenameModal(false)}
      >
        <div className="space-y-4">
          <label className="block text-sm text-cyan-100">
            New name
            <input
              autoFocus
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              className="mt-1 w-full bg-cyan-950/70 border border-cyan-600/40 rounded-md px-3 py-2 text-cyan-50 placeholder-cyan-200/60"
              placeholder="Folder name"
            />
          </label>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setShowRenameModal(false)}
              className="text-xs px-3 py-1.5 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
            >
              Cancel
            </button>
            <button
              onClick={submitRename}
              className="text-xs px-3 py-1.5 rounded-md border border-emerald-700 bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-50"
              disabled={!renameName.trim()}
            >
              Save
            </button>
          </div>
        </div>
      </Modal>

      {/* Generated file preview modal */}
      <Modal
        open={genPreviewOpen}
        title={genPreviewTitle}
        onClose={() => setGenPreviewOpen(false)}
      >
        <div className="space-y-3">
          {genPreviewLoading && (
            <div className="text-xs text-cyan-200">Loading…</div>
          )}
          {genPreviewError && (
            <div className="text-xs text-red-200">❌ {genPreviewError}</div>
          )}
          {(genPreviewUrl || genPreviewText) && (
            <div className="flex items-center justify-end gap-2">
              {genPreviewUrl && (
                <>
                  <a
                    href={genPreviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs underline text-cyan-200 hover:text-cyan-100"
                  >
                    Open ↗
                  </a>
                  <button
                    onClick={() =>
                      downloadUrl(genPreviewUrl!, genPreviewTitle || 'file')
                    }
                    className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
                  >
                    Download
                  </button>
                </>
              )}
              {genPreviewText && (
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(genPreviewText);
                    } catch {
                      /* ignore */
                    }
                  }}
                  className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
                >
                  Copy text
                </button>
              )}
            </div>
          )}
          {genPreviewText ? (
            <div className="rounded-lg border border-cyan-600/40 bg-cyan-950/60 p-4 leading-7">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={mdComponents}
              >
                {genPreviewText}
              </ReactMarkdown>
            </div>
          ) : genPreviewUrl ? (
            <div className="rounded-md border border-cyan-600/40 bg-cyan-950/40 overflow-hidden">
              <iframe
                src={genPreviewUrl}
                className="w-full h-[70vh]"
                title={genPreviewTitle}
              />
            </div>
          ) : null}
        </div>
      </Modal>

      {/* Paywall modal (icon click) */}
      <Modal
        open={!!showPaywall}
        title="Premium Feature"
        onClose={() => setShowPaywall(false)}
      >
        <Paywall
          feature={(showPaywall || 'interpreter') as 'interpreter' | 'converter'}
          onUpgrade={() => (window.location.href = '/billing')}
        />
      </Modal>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   Desktop grid + icons
────────────────────────────────────────────────────────── */
function DesktopGrid({
  uploadedCount,
  generatedCount,
  memoryCount,
  customFolders,
  selectedId,
  setSelected,
  onOpen,
  onNewFolder,
  onDeleteFolder,
  onRenameFolder,
  isPremium,
  plan,
  onShowPaywall,
}: {
  uploadedCount: number;
  generatedCount: number;
  memoryCount: number;
  customFolders: CustomFolder[];
  selectedId: string | null;
  setSelected: (id: string | null) => void;
  onOpen: (view: FolderId) => void;
  onNewFolder: () => void;
  onDeleteFolder: (id: `custom:${string}`) => void;
  onRenameFolder: (id: `custom:${string}`) => void;
  isPremium: boolean;
  plan: Plan;
  onShowPaywall: (f: 'interpreter' | 'converter') => void;
}) {
  const pluralize = (n: number) => `${n} item${n === 1 ? '' : 's'}`;
  const isFree = plan === 'free';

  const icons: Array<{
    id: string;
    icon: string;
    title: string;
    subtitle?: string;
    onOpen: () => void;
    onDelete?: () => void;
    onRename?: () => void;
    locked?: boolean;
  }> = [
    {
      id: 'uploaded',
      icon: '📁',
      title: 'Uploaded Files',
      subtitle: pluralize(uploadedCount),
      onOpen: () => onOpen('uploaded'),
    },
    {
      id: 'generated',
      icon: '✨',
      title: 'Generated Files',
      subtitle: pluralize(generatedCount),
      onOpen: () => onOpen('generated'),
    },
    {
      id: 'converter',
      icon: '🔁',
      title: 'File Converter',
      subtitle: isPremium
        ? 'PNG ⇄ JPG ⇄ WEBP'
        : plan === 'loading'
        ? 'Checking…'
        : 'Premium',
      onOpen: () =>
        isFree ? onShowPaywall('converter') : onOpen('converter'),
      locked: isFree,
    },
    {
      id: 'generator',
      icon: '🧩',
      title: 'File Generator',
      subtitle: 'Docgen',
      onOpen: () => onOpen('generator'),
    },
    {
      id: 'interpreter',
      icon: '📝',
      title: 'File Interpreter',
      subtitle: isPremium
        ? 'Summarize files'
        : plan === 'loading'
        ? 'Checking…'
        : 'Premium',
      onOpen: () =>
        isFree ? onShowPaywall('interpreter') : onOpen('interpreter'),
      locked: isFree,
    },
    {
      id: 'memory',
      icon: '🧠',
      title: 'Memory Files',
      subtitle: pluralize(memoryCount),
      onOpen: () => onOpen('memory'),
    },
    {
  id: 'datacenter',
  icon: '🗄️',
  title: 'Data Center',
  subtitle: 'Relevant knowledge',
  onOpen: () => onOpen('datacenter'),
},

    ...customFolders.map((f) => ({
      id: f.id,
      icon: '📁',
      title: f.name,
      subtitle: 'Empty',
      onOpen: () => onOpen(f.id),
      onDelete: () => onDeleteFolder(f.id),
      onRename: () => onRenameFolder(f.id),
    })),
    {
      id: 'new-folder',
      icon: '➕',
      title: 'New Folder',
      subtitle: 'Create a local folder (UI)',
      onOpen: onNewFolder,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl 2xl:max-w-7xl grid [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))] gap-x-12 gap-y-14">
      {icons.map((it) => (
        <DesktopIcon
          key={it.id}
          icon={it.icon}
          title={it.title}
          subtitle={it.subtitle}
          selected={selectedId === it.id}
          onClick={() => {
            setSelected(it.id);
            it.onOpen();
          }}
          onDelete={it.onDelete}
          onRename={it.onRename}
          locked={!!it.locked}
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
  onDelete,
  onRename,
  locked,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  selected?: boolean;
  onClick: () => void;
  onDelete?: () => void;
  onRename?: () => void;
  locked?: boolean;
}) {
  return (
    <div
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onClick();
      }}
      className="group select-none w-36 focus:outline-none transition-transform hover:-translate-y-0.5"
      onContextMenu={(e) => {
        if (!onDelete && !onRename) return;
        e.preventDefault();
        const action = window.prompt('Type: delete, rename, or cancel', 'rename');
        if (!action) return;
        if (action.toLowerCase().startsWith('del') && onDelete) onDelete();
        else if (action.toLowerCase().startsWith('ren') && onRename) onRename();
      }}
    >
      <div
        className={`relative mx-auto h-24 w-24 grid place-items-center rounded-xl border
        ${
          selected
            ? 'bg-cyan-600/30 border-cyan-200'
            : 'bg-cyan-900/40 border-cyan-600/40 group-hover:border-cyan-400'
        }
        shadow-md transition`}
      >
        <div className="text-5xl">{icon}</div>

        {locked && (
          <div className="absolute -top-2 -right-2 h-7 px-2 rounded-full border border-amber-300/70 bg-amber-400/90 text-indigo-900 text-[10px] font-bold grid place-items-center shadow">
            🔒 PREMIUM
          </div>
        )}

        {(onDelete || onRename) && (
          <div className="absolute -top-2 -right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
            {onRename && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onRename();
                }}
                title="Rename"
                className="h-6 w-6 grid place-items-center rounded-full border border-cyan-400/60 bg-cyan-900/80 text-[10px]"
              >
                ✎
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                }}
                title="Delete"
                className="h-6 w-6 grid place-items-center rounded-full border border-rose-600/80 bg-rose-700/90 text-white text-[10px]"
              >
                ✕
              </button>
            )}
          </div>
        )}
      </div>
      <div className="mt-3 text-center">
        <div
          className={`text-cyan-50 text-[13px] leading-4 ${
            selected ? 'font-semibold' : ''
          }`}
        >
          {title}
        </div>
        {subtitle && (
          <div className="text-xs text-cyan-200 mt-0.5">{subtitle}</div>
        )}
      </div>
    </div>
  );
}
