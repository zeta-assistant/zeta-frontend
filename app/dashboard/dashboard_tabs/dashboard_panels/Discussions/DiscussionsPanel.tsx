'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

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

export default function DiscussionsPanel({ fontSize }: { fontSize: 'sm' | 'base' | 'lg' }) {
  const { projectId } = useParams<{ projectId: string }>();
  const search = useSearchParams();
  const seedFromQuery = useMemo(() => (search?.get('seed') || '').trim() || null, [search]);

  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [filter, setFilter] = useState('');
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
  const [notify, setNotify] = useState(true);

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
      await supabase
        .from('discussions')
        .delete()
        .eq('project_id', projectId as string)
        .eq('thread_id', threadId);
      await supabase
        .from('threads')
        .delete()
        .or(`openai_thread_id.eq.${threadId},thread_id.eq.${threadId}`)
        .eq('project_id', projectId as string);

      if (selected?.thread_id === threadId) setSelected(null);
      await refreshList();
      setStatus('Discussion deleted.');
      setTimeout(() => setStatus(null), 1500);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to delete discussion.');
    }
  }

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
        // seed is JSON: { notification, firstUser, title }
        let parsed: { notification?: string; firstUser?: string; title?: string } = {};
        try {
          parsed = JSON.parse(seed);
        } catch {}

        const notif = (parsed.notification || '').trim();
        const firstUser = (parsed.firstUser || '').trim();
        const title = (parsed.title || 'Follow-up').trim();

        const threadId = await createDiscussionRow({
          title,
          initialAssistant: notif || undefined, // FIRST outgoing message from Zeta
          initialUser: firstUser || undefined, // Your mini-chat reply
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
        {
          event: 'INSERT',
          schema: 'public',
          table: 'discussion_messages',
          filter: `thread_id=eq.${selected.thread_id}`,
        },
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

  async function pollAssistantOnce(threadId: string, sinceIso: string): Promise<Msg | null> {
    const { data } = await supabase
      .from('discussion_messages')
      .select('id, thread_id, role, content, created_at')
      .eq('thread_id', threadId)
      .eq('role', 'assistant')
      .gt('created_at', sinceIso)
      .order('created_at', { ascending: true })
      .limit(1);
    return (data && data[0]) || null;
  }

  function appendAssistantIfMissing(text: string) {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant' && last.content === text) return prev;
      const thread_id = selected?.thread_id || '';
      return [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          thread_id,
          role: 'assistant',
          content: text,
          created_at: new Date().toISOString(),
        },
      ];
    });
  }

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

    const sinceIso = new Date().toISOString();

    try {
      const res = await fetch('/api/discussion-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: selected.thread_id, message: trimmed }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `Reply failed: ${res.status}`);

      if (json?.reply && typeof json.reply === 'string' && json.reply.trim()) {
        appendAssistantIfMissing(json.reply.trim());
      } else {
        for (let i = 0; i < 8; i++) {
          const hit = await pollAssistantOnce(selected.thread_id, sinceIso);
          if (hit) {
            appendAssistantIfMissing(hit.content);
            break;
          }
          await new Promise((r) => setTimeout(r, 800));
        }
      }
    } catch (e: any) {
      setError(e?.message ?? 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  /* -------------------------- UI ---------------------------- */
  const filtered = useMemo(
    () => discussions.filter((d) => (d.title || '').toLowerCase().includes(filter.toLowerCase())),
    [discussions, filter]
  );

  const atLimit = discussions.length >= MAX_DISCUSSIONS;

  return (
    <div
      className={`h-full min-h-0 flex flex-col bg-gradient-to-b from-blue-950 to-blue-900 text-${fontSize} text-blue-100`}
    >
      {/* header */}
      <div className="sticky top-0 z-10 border-b border-white/10 bg-blue-950/70 backdrop-blur px-5 py-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">💬 Discussions</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setNotify(!notify)}
              className={`rounded-lg px-3 py-2 text-sm ${
                notify ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-600 hover:bg-gray-700'
              }`}
              title="Notifications toggle (UI only)"
            >
              {notify ? '🔔 On' : '🔕 Off'}
            </button>
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Search…ddd"
              className="hidden md:block px-3 py-2 rounded-lg bg-blue-900/60 border border-blue-700/60 text-blue-100 placeholder:text-blue-300/60 focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
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
                    setSelected({
                      thread_id: threadId,
                      title: 'New Discussion',
                      last_updated: new Date().toISOString(),
                    });
                    await loadMessages(threadId);
                  }
                } finally {
                  setCreating(false);
                  setStatus(null);
                }
              }}
              disabled={creating || atLimit}
              title={atLimit ? `Limit ${MAX_DISCUSSIONS} reached` : 'Create new discussion'}
              className={`rounded-lg px-3 py-2 shadow ${
                atLimit ? 'bg-blue-600/50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
              } text-white`}
            >
              ➕ New
            </button>
          </div>
        </div>
        {(status || error || atLimit) && (
          <div className="mt-2 text-sm">
            {status && <span className="text-blue-200">{status}</span>}
            {error && <span className="text-red-300 ml-3">{error}</span>}
            {atLimit && !error && (
              <span className="text-yellow-300 ml-3">Max {MAX_DISCUSSIONS} discussions reached.</span>
            )}
          </div>
        )}
      </div>

      {/* content: list + chat pane */}
      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 gap-4 p-5 overflow-hidden">
        {/* left */}
        <div className="space-y-4 overflow-y-auto pr-1">
          {loading ? (
            <div className="space-y-3 animate-pulse">
              <div className="h-12 rounded-xl bg-blue-800/40" />
              <div className="h-12 rounded-xl bg-blue-800/40" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-blue-300/80">
              {discussions.length === 0 ? 'No discussions yet.' : 'No results.'}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {filtered.map((d) => {
                const isActive = selected?.thread_id === d.thread_id;
                return (
                  <div
                    key={d.thread_id}
                    className={`rounded-2xl p-4 transition shadow bg-gradient-to-br from-blue-800/70 to-blue-850/70 border border-blue-700/60 ${
                      isActive ? 'ring-2 ring-purple-500' : 'hover:from-blue-700/70 hover:to-blue-800/70'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button onClick={() => setSelected(d)} className="text-left flex-1">
                        <div className="font-semibold text-white line-clamp-2">
                          {d.title || 'Untitled'}
                        </div>
                        <div className="mt-2 text-xs text-blue-200/80">Last: {fmt(d.last_updated)}</div>
                      </button>
                      <button
                        onClick={() => deleteDiscussion(d.thread_id)}
                        className="shrink-0 text-xs px-2 py-1 rounded-lg bg-red-600/90 hover:bg-red-700 text-white"
                        title="Delete discussion"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* right: phone-style chat */}
        <div className="flex flex-col items-center">
          <div
            className="
              w-full max-w-sm
              flex-1
              md:h-[600px]
              max-h-[calc(100vh-230px)]
              min-h-[320px]
              rounded-2xl border border-blue-700/60
              bg-blue-900/40 flex flex-col overflow-hidden shadow-lg
            "
          >
            {!selected ? (
              <div className="flex-1 grid place-items-center text-blue-300/80 p-6">
                Select a discussion to open the conversation.
              </div>
            ) : (
              <>
                {/* Title chip */}
                <div className="border-b border-blue-700/60 px-4 py-3 text-center font-semibold text-white">
                  {selected.title || 'Discussion'}
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {msgLoading ? (
                    <div className="space-y-2 animate-pulse">
                      <div className="h-12 w-10/12 rounded-xl bg-blue-800/40" />
                    </div>
                  ) : (
                    <>
                      {messages.map((msg) => {
                        const isUser = msg.role === 'user';
                        return (
                          <div
                            key={msg.id ?? `${msg.created_at}-${Math.random()}`}
                            className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={[
                                'px-4 py-2 rounded-2xl shadow whitespace-pre-wrap leading-relaxed max-w-[75%]',
                                isUser
                                  ? 'bg-purple-600 text-white rounded-br-none'
                                  : 'bg-blue-700 text-white rounded-bl-none',
                              ].join(' ')}
                              title={
                                msg.created_at ? new Date(msg.created_at).toLocaleString() : ''
                              }
                            >
                              {msg.content}
                            </div>
                          </div>
                        );
                      })}
                      {sending && (
                        <div className="flex justify-start">
                          <div className="bg-blue-700 text-white px-3 py-2 rounded-2xl rounded-bl-none animate-pulse">
                            …
                          </div>
                        </div>
                      )}
                      <div ref={endRef} />
                    </>
                  )}
                </div>

                <div className="border-t border-blue-700/60 px-4 py-3">
                  <div className="flex gap-2">
                    <input
                      className="flex-1 p-3 rounded-xl bg-blue-900/70 border border-blue-600/70 text-white placeholder:text-blue-300/60 focus:outline-none focus:ring-2 focus:ring-purple-500"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Type a message…"
                      onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                    />
                    <button
                      onClick={sendMessage}
                      disabled={sending || !input.trim()}
                      className="rounded-xl px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-60"
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
