'use client';

import React from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabaseClient';
import { SectionCard } from './common';

/** ─────────────────────────────────────────────────────────
 * Types
 * ───────────────────────────────────────────────────────── */
type Tab = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'annual';

type MemoryItem = {
  name: string;      // filename
  url: string;       // public URL (if exists)
  path: string;      // storage path
  exists: boolean;   // whether the file exists in storage
  label: string;     // nice label for the UI
  date: string;      // canonical date for sort
  dbMemory: string | null; // fallback text from DB row (if present)
};

/** ─────────────────────────────────────────────────────────
 * Small modal (self-contained so this file works standalone)
 * ───────────────────────────────────────────────────────── */
function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted) return null;
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
            <div className="text-cyan-50 font-medium truncate pr-3">{title}</div>
            <button
              onClick={onClose}
              className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
            >
              Close
            </button>
          </div>
          <div className="p-5 overflow-auto max-h-[calc(85vh-52px)] pr-2">{children}</div>
        </div>
      </div>
    </ModalPortal>
  );
}

/** ─────────────────────────────────────────────────────────
 * Helpers
 * ───────────────────────────────────────────────────────── */
const TABLE_BY_TAB: Record<Tab, string> = {
  daily: 'zeta_daily_memory',
  weekly: 'zeta_weekly_memory',
  monthly: 'zeta_monthly_memory',
  quarterly: 'zeta_quarterly_memory',
  annual: 'zeta_annual_memory',
};

function quarterFromDateStr(dateStr: string) {
  const m = Number((dateStr.split('-')[1] ?? '1'));
  return Math.max(1, Math.min(4, Math.floor((m - 1) / 3) + 1));
}
function makeFileName(t: Tab, dateStr: string) {
  switch (t) {
    case 'daily':
      return `memory-${dateStr}.txt`;
    case 'weekly':
      return `memory-week-${dateStr}.txt`;
    case 'monthly':
      return `memory-${dateStr.slice(0, 7)}.txt`;
    case 'quarterly':
      return `memory-${dateStr.slice(0, 4)}-Q${quarterFromDateStr(dateStr)}.txt`;
    case 'annual':
      return `memory-${dateStr.slice(0, 4)}.txt`;
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

function parseDateFromFilename(t: Tab, name: string): string | null {
  if (t === 'daily') {
    const m =
      name.match(/^memory-(\d{4}-\d{2}-\d{2})\.txt$/i) ||
      name.match(/^daily-user-report-(\d{4}-\d{2}-\d{2})\.txt$/i);
    return m ? m[1] : null;
  }
  if (t === 'weekly') {
    const m =
      name.match(/^memory-week-(\d{4}-\d{2}-\d{2})\.txt$/i) ||
      name.match(/^weekly-user-report-(\d{4}-\d{2}-\d{2})\.txt$/i);
    return m ? m[1] : null;
  }
  return null;
}

/** ─────────────────────────────────────────────────────────
 * Component
 * ───────────────────────────────────────────────────────── */
export default function MemoryView({
  projectId,
}: {
  projectId: string;
}) {
  const bucket = 'memory';
  const [tab, setTab] = React.useState<Tab>('daily');
  const [loading, setLoading] = React.useState(true);
  const [err, setErr] = React.useState<string | null>(null);
  const [items, setItems] = React.useState<MemoryItem[]>([]);

  // preview
  const [previewOpen, setPreviewOpen] = React.useState(false);
  const [previewTitle, setPreviewTitle] = React.useState('');
  const [previewText, setPreviewText] = React.useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [previewError, setPreviewError] = React.useState<string | null>(null);

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

  async function refresh() {
    if (!projectId) return;
    setErr(null);
    setLoading(true);

    try {
      // 1) rows from DB (for dates + fallback text)
      const rows = (await fetchRows(projectId, tab)).filter(r => !!r?.date);

      // 2) list storage for this tab + legacy (daily)
      const subprefix = `${projectId}/${tab}/`;
      const { data: subItems } = await supabase.storage
        .from(bucket)
        .list(subprefix, { limit: 400, sortBy: { column: 'name', order: 'desc' } });
      const subNames = new Set<string>((subItems ?? []).map(f => f.name));

      const { data: legacyDaily } =
        tab === 'daily'
          ? await supabase.storage.from(bucket).list(`${projectId}/`, { limit: 400, sortBy: { column: 'name', order: 'desc' } })
          : { data: [] as any[] };
      const legacyDailyNames = tab === 'daily' ? new Set<string>((legacyDaily ?? []).map(f => f.name)) : new Set<string>();

      // 3) combine by date
      const dateToDb = new Map<string, string | null>();
      for (const r of rows) dateToDb.set(r.date, r.memory ?? null);

      if (tab === 'daily' || tab === 'weekly') {
        for (const name of subNames) {
          const d = parseDateFromFilename(tab, name);
          if (d && !dateToDb.has(d)) dateToDb.set(d, null);
        }
        if (tab === 'daily') {
          for (const name of legacyDailyNames) {
            const d = parseDateFromFilename(tab, name);
            if (d && !dateToDb.has(d)) dateToDb.set(d, null);
          }
        }
      }

      // 4) build UI items (prefer new names if present)
      const built: MemoryItem[] = Array.from(dateToDb.entries()).map(([date, dbMemory]) => {
        let fname = makeFileName(tab, date);
        let path = `${projectId}/${tab}/${fname}`;
        let exists = subNames.has(fname);

        if (tab === 'daily') {
          const reportName = `daily-user-report-${date}.txt`;
          const preferNew = subNames.has(reportName);
          const legacyHasReport = legacyDailyNames.has(reportName);
          const legacyHasDefault = legacyDailyNames.has(fname);
          const usingLegacy = !preferNew && !exists && (legacyHasReport || legacyHasDefault);

          fname = preferNew ? reportName : fname;
          exists = preferNew || exists || legacyHasReport || legacyHasDefault;
          path = usingLegacy ? `${projectId}/${fname}` : `${projectId}/${tab}/${fname}`;
        } else if (tab === 'weekly') {
          const reportName = `weekly-user-report-${date}.txt`;
          if (subNames.has(reportName)) {
            fname = reportName;
            exists = true;
            path = `${projectId}/${tab}/${fname}`;
          }
        }

        const url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
        return { name: fname, url, path, exists, label: labelFor(tab, date), date, dbMemory };
      });

      built.sort((a, b) => (a.date < b.date ? 1 : -1));
      setItems(built);
    } catch (e: any) {
      setErr(e?.message ?? 'Failed to load memory');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, tab]);

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

  return (
    <>
      <SectionCard
        title="Memory Files"
        subtitle="Zeta’s internal/context files"
        right={
          <div className="flex gap-2">
            <button
              onClick={refresh}
              className="text-xs px-2 py-1 rounded-md border border-cyan-400/50 bg-cyan-900/40 hover:bg-cyan-900/60"
            >
              Refresh
            </button>
          </div>
        }
      >
        {/* Tabs */}
        <div className="mb-3 flex items-center gap-2">
          {(['daily', 'weekly', 'monthly', 'quarterly', 'annual'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize border ${
                tab === t
                  ? 'bg-cyan-200 text-cyan-900 border-cyan-300'
                  : 'bg-cyan-900/40 text-cyan-100 border-cyan-600/40 hover:bg-cyan-900/60'
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Errors / Loading / List */}
        {err && (
          <div className="mb-3 rounded-lg border border-red-400/70 bg-red-900/40 p-2 text-xs text-red-100">
            {err}
          </div>
        )}

        {loading ? (
          <ul className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i} className="animate-pulse h-12 rounded-lg border border-cyan-500/30 bg-cyan-900/20" />
            ))}
          </ul>
        ) : items.length ? (
          <ul className="space-y-2">
            {items.map((f) => (
              <li
                key={`${tab}:${f.name}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-cyan-500/40 bg-cyan-900/30 p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xl">🧠</span>
                  <div className="min-w-0">
                    <div className="truncate text-cyan-50">{f.name}</div>
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
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline text-cyan-200 hover:text-cyan-100"
                      >
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
      </SectionCard>

      {/* Preview Modal */}
      <Modal open={previewOpen} title={previewTitle} onClose={() => setPreviewOpen(false)}>
        {previewLoading && <div className="text-xs text-cyan-200">Loading…</div>}
        {previewError && <div className="text-xs text-red-200">❌ {previewError}</div>}
        {previewText && (
          <>
            <div className="flex justify-end mb-2">
              <button
                onClick={async () => {
                  if (previewText) {
                    try {
                      await navigator.clipboard.writeText(previewText);
                    } catch {}
                  }
                }}
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
      </Modal>
    </>
  );
}
