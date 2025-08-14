'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Thought = {
  id: string;
  content: string;
  category: 'Idea' | 'Observation' | 'Warning' | 'Question';
  source_trigger: string;
  created_at: string;
  pinned: boolean;
  actioned: boolean;
};

type Props = { projectId: string; fontSize?: 'sm' | 'base' | 'lg' };

const CACHE_TTL_MS = 60_000;

export default function ThoughtsPanel({ projectId, fontSize = 'base' }: Props) {
  const [thoughts, setThoughts] = useState<Thought[]>([]);
  const [loading, setLoading] = useState(true);
  const [genBusy, setGenBusy] = useState(false);
  const [hasSession, setHasSession] = useState<boolean>(false);
  const hydratedFromCache = useRef(false);

  const sizeClass =
    fontSize === 'sm' ? 'text-sm' : fontSize === 'lg' ? 'text-lg' : 'text-base';

  const badgeStyle = (c: Thought['category']) => {
    switch (c) {
      case 'Idea': return 'bg-amber-500/15 text-amber-200 ring-amber-400/20';
      case 'Warning': return 'bg-rose-500/15 text-rose-200 ring-rose-400/20';
      case 'Question': return 'bg-sky-500/15 text-sky-200 ring-sky-400/20';
      default: return 'bg-emerald-500/15 text-emerald-200 ring-emerald-400/20';
    }
  };
  const cardStripe = (c: Thought['category']) => {
    switch (c) {
      case 'Idea': return 'before:bg-amber-400/80';
      case 'Warning': return 'before:bg-rose-500/80';
      case 'Question': return 'before:bg-sky-500/80';
      default: return 'before:bg-emerald-500/80';
    }
  };
  const iconFor = (c: Thought['category']) =>
    c === 'Idea' ? '💡' : c === 'Warning' ? '⚠️' : c === 'Question' ? '❓' : '🔍';

  function timeAgo(iso: string) {
    const d = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - d);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const days = Math.floor(h / 24);
    return `${days}d ago`;
  }

  const cacheKey = (pid: string) => `thoughts:${pid}`;
  const cachePut = (pid: string, data: Thought[]) => {
    try { sessionStorage.setItem(cacheKey(pid), JSON.stringify({ t: Date.now(), data })); } catch {}
  };
  const cacheGet = (pid: string): { t: number; data: Thought[] } | null => {
    try {
      const raw = sessionStorage.getItem(cacheKey(pid));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  async function getOptionalAuthHeaders(): Promise<HeadersInit> {
    const { data: { session } } = await supabase.auth.getSession();
    setHasSession(!!session);
    const h: Record<string, string> = {};
    if (session?.access_token) h['Authorization'] = `Bearer ${session.access_token}`;
    return h;
  }

  async function refreshNow() {
    const headers = await getOptionalAuthHeaders();
    const res = await fetch(`/api/thoughts/list?projectId=${projectId}`, { headers });
    const json = await res.json().catch(() => ({ thoughts: [] }));
    const next: Thought[] = json.thoughts || [];
    setThoughts(next);
    cachePut(projectId, next);
  }

  useEffect(() => {
    let mounted = true;

    const cached = cacheGet(projectId);
    if (cached?.data) {
      setThoughts(cached.data);
      hydratedFromCache.current = true;
      setLoading(false);
    }

    (async () => {
      const headers = await getOptionalAuthHeaders();
      const isStale = !cached || Date.now() - cached.t > CACHE_TTL_MS;

      if (!hydratedFromCache.current) {
        const res = await fetch(`/api/thoughts/list?projectId=${projectId}`, { headers });
        const json = await res.json().catch(() => ({ thoughts: [] }));
        if (!mounted) return;
        const data: Thought[] = json.thoughts || [];
        setThoughts(data);
        cachePut(projectId, data);
        setLoading(false);
      } else if (isStale) {
        refreshNow();
      } else {
        setLoading(false);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange(async () => {
      if (!mounted) return;
      await refreshNow();
      setLoading(false);
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, [projectId]);

  async function update(id: string, payload: Partial<Thought>) {
    const headers = { 'Content-Type': 'application/json', ...(await getOptionalAuthHeaders()) };
    await fetch('/api/thoughts/update', { method: 'POST', headers, body: JSON.stringify({ id, ...payload }) });
    await refreshNow();
  }

  async function remove(id: string) {
    const headers = { 'Content-Type': 'application/json', ...(await getOptionalAuthHeaders()) };
    await fetch('/api/thoughts/delete', { method: 'POST', headers, body: JSON.stringify({ id }) });
    await refreshNow();
  }

  async function generateNow() {
    setGenBusy(true);
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 25_000);
    try {
      const headers = { 'Content-Type': 'application/json', ...(await getOptionalAuthHeaders()) };
      const res = await fetch('/api/thoughts/generate', {
        method: 'POST',
        signal: ctl.signal,
        headers,
        body: JSON.stringify({ project_id: projectId, trigger: 'manual' }),
      });
      const ct = res.headers.get('content-type') || '';
      const body = ct.includes('application/json') ? await res.json().catch(() => ({})) : await res.text().catch(() => '');
      if (!res.ok) {
        const msg = typeof body === 'object' ? (body as any)?.error ?? JSON.stringify(body) : typeof body === 'string' && body ? body : `HTTP ${res.status}`;
        alert(`Generate failed: ${msg}`);
        return;
      }
      await refreshNow();
    } catch (e: any) {
      alert(`Generate error: ${e?.name === 'AbortError' ? 'Request timed out' : (e?.message || String(e))}`);
    } finally {
      clearTimeout(timer);
      setGenBusy(false);
    }
  }

  const headerRight = useMemo(() => (
    <div className="flex items-center gap-2">
      <button
        onClick={refreshNow}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/10 
                 bg-white/5 hover:bg-white/10 text-xs transition"
        title="Refresh"
      >
        ⟳ <span className="hidden sm:inline">Refresh</span>
      </button>
      <button
        onClick={generateNow}
        disabled={genBusy}
        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs border border-violet-400/30 
                 bg-violet-500/20 hover:bg-violet-500/30 transition disabled:opacity-60"
        title="Generate a new thought now"
      >
        ⚡ {genBusy ? 'Generating…' : 'Generate now'}
      </button>
    </div>
  ), [genBusy]);

  return (
    <div className={`rounded-2xl border border-white/10 bg-white/5 ${sizeClass} flex flex-col max-h-[70vh]`}>
      {/* Sticky header inside the panel */}
      <div className="flex items-center justify-between px-3 py-3 sticky top-0 z-[5] bg-white/5 backdrop-blur rounded-t-2xl border-b border-white/10">
        <h2 className="text-lg sm:text-xl font-semibold text-white">Thoughts</h2>
        {headerRight}
      </div>

      {/* Scrollable list area */}
      <div className="px-3 pb-3 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
        {loading ? (
          <div className="mt-2 grid gap-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-4">
                <div className="h-3 w-24 rounded bg-white/15 animate-pulse" />
                <div className="mt-3 h-4 w-3/4 rounded bg-white/15 animate-pulse" />
                <div className="mt-2 h-4 w-1/2 rounded bg-white/10 animate-pulse" />
              </div>
            ))}
          </div>
        ) : thoughts.length === 0 ? (
          <div className="mt-4 rounded-xl border border-white/10 bg-gradient-to-br from-white/5 to-white/10 p-6">
            <div className="text-base text-white/90">No thoughts yet.</div>
            <div className="mt-1 text-sm text-white/70">
              They’ll show up daily and after key events. You can also generate one now.
            </div>
            <div className="mt-4">
              <button
                onClick={generateNow}
                disabled={genBusy}
                className="px-4 py-2 rounded-xl bg-violet-500/20 border border-violet-400/30 hover:bg-violet-500/30 transition text-sm"
              >
                {genBusy ? 'Generating…' : 'Generate first thought'}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 grid gap-3">
            {thoughts.map((t) => (
              <div
                key={t.id}
                className={`relative rounded-xl border border-white/10 bg-white/5 p-4
                            before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:rounded-l-xl
                            ${cardStripe(t.category)}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-white/70 flex items-center gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full ring-1 ${badgeStyle(t.category)}`}>
                        <span>{iconFor(t.category)}</span>
                        <span className="hidden sm:inline">{t.category}</span>
                      </span>
                      <span>•</span>
                      <span title={new Date(t.created_at).toLocaleString()}>
                        {timeAgo(t.created_at)}
                      </span>
                      {t.source_trigger && (
                        <>
                          <span>•</span>
                          <span className="uppercase tracking-wide">{t.source_trigger}</span>
                        </>
                      )}
                      {t.pinned && <span>• pinned</span>}
                      {t.actioned && <span>• actioned</span>}
                    </div>

                    <div className="mt-2 text-white leading-relaxed break-words">
                      {t.content}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => update(t.id, { pinned: !t.pinned })}
                      className="px-2 py-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs"
                      title={t.pinned ? 'Unpin' : 'Pin'}
                    >
                      {t.pinned ? 'Unpin' : 'Pin'}
                    </button>
                    <button
                      onClick={() => update(t.id, { actioned: !t.actioned })}
                      className="px-2 py-1 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-xs"
                      title={t.actioned ? 'Mark un-actioned' : 'Mark actioned'}
                    >
                      {t.actioned ? 'Un-action' : 'Actioned'}
                    </button>
                    <button
                      onClick={() => remove(t.id)}
                      className="px-2 py-1 rounded-lg border border-rose-300/30 bg-rose-500/10 hover:bg-rose-500/20 text-xs text-rose-200"
                      title="Delete"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        {!hasSession && (
          <div className="mt-3 text-[11px] text-white/60">
            Viewing as guest — sign in for pin/action controls to persist across devices.
          </div>
        )}
      </div>
    </div>
  );
}