'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { formatMathMarkdown } from '@/lib/formatMathMarkdown';

type Discussion = {
  thread_id: string;
  title: string;
  last_updated?: string | null;
};

type Msg = {
  id?: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
};

const fmt = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : '—');
const MAX_DISCUSSIONS = 20;

const textScale = (fs: 'sm' | 'base' | 'lg') =>
  fs === 'sm'
    ? 'text-[13px] leading-6'
    : fs === 'lg'
    ? 'text-[16.5px] leading-8'
    : 'text-[15px] leading-7';

const proseScale = (fs: 'sm' | 'base' | 'lg') =>
  fs === 'sm' ? 'prose-sm' : fs === 'lg' ? 'prose-lg' : 'prose';

export default function DiscussionsPanel({ fontSize }: { fontSize: 'sm' | 'base' | 'lg' }) {
  const { projectId } = useParams<{ projectId: string }>();
  const search = useSearchParams();
  const seedFromQuery = useMemo(() => (search?.get('seed') || '').trim() || null, [search]);

  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [bootHandled, setBootHandled] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selected, setSelected] = useState<Discussion | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  // rename state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  /* ------------------------- list data ------------------------- */
  async function refreshList() {
    if (!projectId) return;

    const { data, error } = await supabase
      .from('discussions')
      .select('thread_id, title, last_updated')
      .eq('project_id', projectId)
      .order('last_updated', { ascending: false });

    if (error) setError(error.message);
    setDiscussions(data || []);
    setLoading(false);
  }

  useEffect(() => {
    void refreshList();
  }, [projectId]);

  // open discussion via ?open=<thread_id>
  useEffect(() => {
    const open = new URLSearchParams(window.location.search).get('open');
    if (!open || discussions.length === 0) return;
    const d = discussions.find((x) => x.thread_id === open);
    if (d) setSelected(d);
  }, [discussions]);

  useEffect(() => {
    if (!projectId) return;
    const ch = supabase
      .channel(`realtime_discussions_${projectId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'discussions', filter: `project_id=eq.${projectId}` },
        () => void refreshList()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [projectId]);

  /* ------------------------- helpers --------------------------- */
  async function createDiscussionRow(payload: {
    title: string;
    initialAssistant?: string;
    initialUser?: string;
  }): Promise<string | null> {
    setStatus('Creating discussion…');
    setError(null);

    if (discussions.length >= MAX_DISCUSSIONS) {
      setStatus(null);
      setError(`Limit reached: you can have up to ${MAX_DISCUSSIONS} discussions per project.`);
      return null;
    }

    const res = await fetch('/api/discussion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, modelId: 'gpt-4o', ...payload }),
    });

    let json: any = {};
    try {
      json = await res.json();
    } catch {}

    if (!res.ok) {
      const msg = json?.error || `Failed to create discussion (HTTP ${res.status})`;
      setError(msg);
      setStatus(null);
      return null;
    }

    const threadId = json?.threadId as string | undefined;
    if (!threadId) {
      setError('Discussion created but no threadId returned.');
      setStatus(null);
      return null;
    }

    setStatus('Discussion created.');
    return threadId;
  }

  async function deleteDiscussion(threadId: string) {
    if (!projectId) return;
    const ok = confirm('Delete this discussion and its messages? This cannot be undone.');
    if (!ok) return;

    setStatus('Deleting discussion…');
    setError(null);

    try {
      await supabase.from('discussion_messages').delete().eq('thread_id', threadId);
      await supabase.from('discussions').delete().eq('project_id', projectId as string).eq('thread_id', threadId);
      await supabase
        .from('threads')
        .delete()
        .or(`openai_thread_id.eq.${threadId},thread_id.eq.${threadId}`)
        .eq('project_id', projectId as string);

      if (selected?.thread_id === threadId) {
        setSelected(null);
        setMessages([]);
      }

      await refreshList();
      setStatus('Discussion deleted.');
      setTimeout(() => setStatus(null), 1200);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete discussion.');
      setStatus(null);
    }
  }

  // rename helpers
  const startRename = (d: Discussion) => {
    setEditingId(d.thread_id);
    setEditValue((d.title || '').trim());
  };
  const cancelRename = () => {
    setEditingId(null);
    setEditValue('');
  };
  const saveRename = async (threadId: string) => {
    if (!projectId) return cancelRename();
    const newTitle = editValue.trim();
    if (!newTitle) return cancelRename();

    setError(null);
    setStatus('Saving…');
    const nowIso = new Date().toISOString();

    const { error } = await supabase
      .from('discussions')
      .update({ title: newTitle, last_updated: nowIso })
      .eq('project_id', projectId as string)
      .eq('thread_id', threadId);

    if (error) {
      setError(error.message);
      setStatus(null);
      return;
    }

    setDiscussions((prev) => prev.map((d) => (d.thread_id === threadId ? { ...d, title: newTitle } : d)));
    if (selected?.thread_id === threadId) setSelected({ ...selected, title: newTitle });

    setStatus(null);
    cancelRename();
  };

  /* -------------------- seed auto-create ---------------------- */
  useEffect(() => {
    if (!projectId || bootHandled) return;
    const seed = seedFromQuery;
    if (!seed) {
      setBootHandled(true);
      return;
    }

    (async () => {
      if (discussions.length >= MAX_DISCUSSIONS) {
        setError(`Limit reached: you can have up to ${MAX_DISCUSSIONS} discussions per project.`);
        setBootHandled(true);
        return;
      }

      setCreating(true);
      try {
        let parsed: { notification?: string; firstUser?: string; title?: string } = {};
        try {
          parsed = JSON.parse(seed);
        } catch {}

        const notif = (parsed.notification || '').trim();
        const firstUser = (parsed.firstUser || '').trim();
        const title = (parsed.title || 'Follow-up').trim();

        const threadId = await createDiscussionRow({
          title,
          initialAssistant: notif || undefined,
          initialUser: firstUser || undefined,
        });

        if (threadId) {
          await refreshList();
          setSelected({ thread_id: threadId, title, last_updated: new Date().toISOString() });
          await loadMessages(threadId);
        }
      } finally {
        setCreating(false);
        setBootHandled(true);
        setStatus(null);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, seedFromQuery, bootHandled]);

  /* -------------------- message loading + RT ------------------- */
  async function loadMessages(threadId: string) {
    setMsgLoading(true);
    const { data, error } = await supabase
      .from('discussion_messages')
      .select('id, thread_id, role, content, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true });

    if (!error) setMessages(data || []);
    setMsgLoading(false);
  }

  useEffect(() => {
    if (!selected?.thread_id) return;
    void loadMessages(selected.thread_id);

    const ch = supabase
      .channel(`realtime_discussion_${selected.thread_id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'discussion_messages', filter: `thread_id=eq.${selected.thread_id}` },
        (payload) => {
          const row = payload.new as Msg;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === row.role && last.content === row.content) return prev;
            return [...prev, row];
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [selected?.thread_id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending]);

  async function sendMessage() {
    const trimmed = input.trim();
    if (!trimmed || sending || !selected?.thread_id) return;

    setSending(true);
    setError(null);

    const optimistic: Msg = {
      id: `local-${Date.now()}`,
      thread_id: selected.thread_id,
      role: 'user',
      content: trimmed,
      created_at: new Date().toISOString(),
    };

    setMessages((m) => [...m, optimistic]);
    setInput('');

    try {
      const res = await fetch('/api/discussion-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: selected.thread_id, message: trimmed }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Reply failed: ${res.status}`);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  const atLimit = discussions.length >= MAX_DISCUSSIONS;

  /* -------------------------- UI ---------------------------- */
  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden bg-gradient-to-b from-blue-950 to-blue-900 text-blue-100">
      {/* content fills full height (no header) */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[1.2fr_0.8fr] gap-4 p-5 overflow-hidden">
        {/* left list */}
        <div className="min-h-0 overflow-y-auto space-y-3 pr-1">
          {/* top row: New button + count + status/error */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={async () => {
                  setCreating(true);
                  try {
                    setError(null);
                    if (atLimit) {
                      setError(`Limit reached: you can have up to ${MAX_DISCUSSIONS} discussions per project.`);
                      return;
                    }
                    const threadId = await createDiscussionRow({ title: 'New Discussion' });
                    if (threadId) {
                      await refreshList();
                      const row: Discussion = {
                        thread_id: threadId,
                        title: 'New Discussion',
                        last_updated: new Date().toISOString(),
                      };
                      setSelected(row);
                      await loadMessages(threadId);
                    }
                  } finally {
                    setCreating(false);
                    setStatus(null);
                  }
                }}
                disabled={creating || atLimit}
                className={`text-sm px-3 py-2 rounded-xl border shadow transition ${
                  creating || atLimit
                    ? 'bg-blue-700/40 border-blue-600/40 text-blue-200 cursor-not-allowed'
                    : 'bg-blue-700 hover:bg-blue-600 border-blue-500 text-white'
                }`}
                title={atLimit ? `Max ${MAX_DISCUSSIONS} discussions reached` : 'Create new discussion'}
              >
                ➕ New Discussion
              </button>

              <div className="text-xs text-blue-200/80">
                {discussions.length}/{MAX_DISCUSSIONS}
              </div>
            </div>

            <div className="text-sm">
              {status && <span className="text-blue-200 mr-2">{status}</span>}
              {error && <span className="text-red-300">{error}</span>}
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-14 rounded-xl bg-blue-800/40" />
              <div className="h-14 rounded-xl bg-blue-800/40" />
            </div>
          ) : discussions.length === 0 ? (
            <div className="text-blue-300/80">No discussions yet.</div>
          ) : (
            discussions.map((d) => {
              const active = selected?.thread_id === d.thread_id;
              const isEditing = editingId === d.thread_id;

              return (
                <div
                  key={d.thread_id}
                  className={`w-full rounded-2xl p-4 border transition shadow ${
                    active
                      ? 'border-purple-500 bg-blue-800/80 ring-2 ring-purple-500'
                      : 'border-blue-700/60 bg-blue-800/60 hover:bg-blue-800/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onBlur={() => void saveRename(d.thread_id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') void saveRename(d.thread_id);
                            if (e.key === 'Escape') cancelRename();
                          }}
                          className="w-full px-2 py-1 rounded-lg bg-blue-900 border border-blue-600 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                        />
                      ) : (
                        <button onClick={() => setSelected(d)} className="text-left w-full">
                          <div className="font-semibold text-white line-clamp-2">{d.title || 'Untitled'}</div>
                          <div className="text-xs text-blue-200 mt-2">Last: {fmt(d.last_updated)}</div>
                        </button>
                      )}
                    </div>

                    <div className="shrink-0 flex items-center gap-2">
                      <button
                        onClick={() => (isEditing ? cancelRename() : startRename(d))}
                        className="text-xs px-2 py-1 rounded-lg bg-blue-700/80 hover:bg-blue-700 text-white"
                        title={isEditing ? 'Cancel rename' : 'Rename'}
                      >
                        ✏️
                      </button>

                      <button
                        onClick={() => void deleteDiscussion(d.thread_id)}
                        className="text-xs px-2 py-1 rounded-lg bg-red-600/90 hover:bg-red-700 text-white"
                        title="Delete discussion"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* right phone */}
        <div className="flex justify-center min-h-0 overflow-hidden">
          <div className="w-full max-w-sm min-h-0 overflow-hidden rounded-2xl border border-blue-700 bg-blue-900/40 flex flex-col shadow-lg">
            {!selected ? (
              <div className="flex-1 grid place-items-center text-blue-300 p-6">Select a discussion</div>
            ) : (
              <>
                {/* title row */}
                <div className="shrink-0 border-b border-blue-700 px-4 py-3 text-white font-semibold flex items-center justify-between gap-2">
                  {editingId === selected.thread_id ? (
                    <input
                      autoFocus
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onBlur={() => void saveRename(selected.thread_id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void saveRename(selected.thread_id);
                        if (e.key === 'Escape') cancelRename();
                      }}
                      className="flex-1 min-w-0 px-2 py-1 rounded-lg bg-blue-900 border border-blue-600 text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  ) : (
                    <div className="truncate">{selected.title || 'Discussion'}</div>
                  )}

                  <div className="shrink-0 flex items-center gap-2">
                    <button
                      onClick={() => (editingId === selected.thread_id ? cancelRename() : startRename(selected))}
                      className="text-xs px-2 py-1 rounded-lg bg-blue-700/80 hover:bg-blue-700 text-white"
                      title={editingId === selected.thread_id ? 'Cancel rename' : 'Rename'}
                    >
                      ✏️
                    </button>

                    <button
                      onClick={() => void deleteDiscussion(selected.thread_id)}
                      className="text-xs px-2 py-1 rounded-lg bg-red-600/90 hover:bg-red-700 text-white"
                      title="Delete this discussion"
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* messages */}
                <div
                  className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3"
                  style={{ overscrollBehavior: 'contain', scrollbarGutter: 'stable' as any }}
                >
                  {msgLoading ? (
                    <div className="space-y-2 animate-pulse">
                      <div className="h-12 w-10/12 rounded-xl bg-blue-800/40" />
                      <div className="h-12 w-8/12 rounded-xl bg-blue-800/30" />
                    </div>
                  ) : (
                    <>
                      {messages.map((m) => {
                        const isUser = m.role === 'user';
                        const formatted = formatMathMarkdown(m.content ?? '');

                        return (
                          <div
                            key={m.id ?? `${m.created_at}-${Math.random()}`}
                            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[85%] rounded-2xl px-4 py-2 border shadow ${
                                isUser
                                  ? 'bg-purple-600 text-white border-purple-400 rounded-br-none'
                                  : 'bg-blue-700 text-white border-blue-400 rounded-bl-none'
                              } ${textScale(fontSize)}`}
                              title={m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                            >
                              <div
                                className={`prose max-w-none ${proseScale(
                                  fontSize
                                )} prose-p:my-2 prose-headings:text-white`}
                              >
                                <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                  {formatted}
                                </ReactMarkdown>
                              </div>
                            </div>
                          </div>
                        );
                      })}

                      {sending && (
                        <div className="flex justify-start">
                          <div className="bg-blue-700 text-white px-3 py-2 rounded-2xl rounded-bl-none animate-pulse border border-blue-400">
                            …
                          </div>
                        </div>
                      )}

                      <div ref={endRef} />
                    </>
                  )}
                </div>

                {/* input (no example line) */}
                <div className="shrink-0 border-t border-blue-700 px-4 py-3">
                  <div className="flex gap-2">
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void sendMessage();
                        }
                      }}
                      placeholder="Type a message…"
                      className="flex-1 rounded-xl bg-blue-900 border border-blue-600 px-3 py-2 text-white placeholder:text-blue-300/70 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      disabled={sending}
                    />
                    <button
                      onClick={() => void sendMessage()}
                      disabled={sending || !input.trim()}
                      className="rounded-xl bg-purple-600 px-4 text-white hover:bg-purple-700 disabled:opacity-60"
                    >
                      {sending ? '…' : 'Send'}
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
