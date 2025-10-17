'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { supabase } from '@/lib/supabaseClient';
import { formatMathMarkdown } from '@/lib/formatMathMarkdown';
import { detectLatexFormats } from '@/lib/latexDetector';

type Uploaded = { file_name: string; file_url: string };
type Verbosity = 'short' | 'normal' | 'long';

interface ChatTabProps {
  activeMainTab: string;
  chatView: 'all' | 'today' | 'pinned';
  setChatView: React.Dispatch<React.SetStateAction<'all' | 'today' | 'pinned'>>;
  chatHidden: boolean;
  setChatHidden: React.Dispatch<React.SetStateAction<boolean>>;
  messages: any[];
  loading?: boolean;
  input: string;
  setInput: (text: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  sendMessage: (opts?: { attachments?: Uploaded[]; verbosity?: Verbosity }) => Promise<void>;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  fontSize: 'sm' | 'base' | 'lg';
  setFontSize: React.Dispatch<React.SetStateAction<'sm' | 'base' | 'lg'>>;
  projectId: string;
  onRefresh: () => Promise<void>;
  refreshing?: boolean;
}

/* ---------- styles ---------- */
const proseScale = (fs: 'sm' | 'base' | 'lg') =>
  fs === 'sm' ? 'prose-sm' : fs === 'lg' ? 'prose-lg' : 'prose';
const textScale = (fs: 'sm' | 'base' | 'lg') =>
  fs === 'sm' ? 'text-[13px] leading-6' : fs === 'lg' ? 'text-[16.5px] leading-8' : 'text-[15px] leading-7';

/* ---------- content helper ---------- */
function getMsgContent(msg: any): string {
  const direct = msg?.message ?? msg?.content ?? msg?.text ?? '';
  if (typeof direct === 'string' && direct) return direct;
  if (Array.isArray(msg?.content)) {
    const piece = msg.content.find((c: any) => c?.type === 'text' && c?.text?.value);
    if (piece?.text?.value) return String(piece.text.value);
  }
  if (msg?.content?.text?.value) return String(msg.content.text.value);
  if (direct && typeof direct === 'object') return JSON.stringify(direct);
  return '';
}

/* ---------- timestamp helpers ---------- */
function rawTs(m: any): any {
  return (
    m?.timestamp ??
    m?.created_at ??
    m?.inserted_at ??
    m?.updated_at ??
    m?.time ??
    m?.ts ??
    m?.createdAt ??
    m?.updatedAt ??
    null
  );
}
function normalizeToDate(v: any): Date | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const ms = v < 1e12 ? v * 1000 : v;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  if (typeof v === 'string') {
    const t = Date.parse(v);
    if (!Number.isNaN(t)) return new Date(t);
  }
  return null;
}
function toDateOrNow(mOrTs: any): Date {
  if (mOrTs && (mOrTs instanceof Date || typeof mOrTs === 'string' || typeof mOrTs === 'number')) {
    return normalizeToDate(mOrTs) ?? new Date();
  }
  return normalizeToDate(rawTs(mOrTs)) ?? new Date();
}

/* ---------- text normalization ---------- */
function normText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/* ---------- TZ helpers ---------- */
function ymdInTZ(d: Date, tz: string): { y: number; m: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? '0');
  return { y: get('year'), m: get('month'), day: get('day') };
}
function sameDayInTZ(a: Date, b: Date, tz: string) {
  const A = ymdInTZ(a, tz);
  const B = ymdInTZ(b, tz);
  return A.y === B.y && A.m === B.m && A.day === B.day;
}
function formatTimeInTZ(isoNumOrDate: any, tz: string) {
  const d = normalizeToDate(isoNumOrDate) ?? new Date();
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', timeZone: tz });
}

const isUserish = (msg: any) =>
  msg?.role === 'user' ||
  (msg?.role === 'system' &&
    typeof getMsgContent(msg) === 'string' &&
    getMsgContent(msg).startsWith('📎 Files attached'));

/* ============ Emoji ============ */
const EMOJIS = [
  '😀','😅','😂','😊','😍','🤔','😴','😎','🙌','👏','👍','🔥','💯','✨','⚡','🚀',
  '🧠','📌','✅','❗','❓','📎','📝','📈','📊','⏱️','🧪','🔧','🛠️','🧰','🧵','🔁'
];

/* ---------- Stable scroller ---------- */
const StableScroller = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  (p, ref) => (
    <div
      {...p}
      ref={ref}
      style={{
        ...(p.style || {}),
        overscrollBehavior: 'contain',
        WebkitOverflowScrolling: 'auto',
        touchAction: 'pan-y',
        scrollbarGutter: 'stable',
      }}
    />
  )
);
StableScroller.displayName = 'StableScroller';

function FooterSpacer() {
  return <div style={{ height: 96 }} />;
}

/* ========================================================= */

const ChatTab: React.FC<ChatTabProps> = (props) => {
  const {
    activeMainTab, chatView, setChatView, chatHidden, setChatHidden,
    messages: messagesProp, loading, input, setInput, handleKeyDown, sendMessage,
    scrollRef, fontSize, setFontSize, projectId, onRefresh, refreshing,
  } = props;

  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [verbosity, setVerbosity] = useState<Verbosity>('normal');
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);

  /* ---------- Project timezone ---------- */
  const [projectTZ, setProjectTZ] = useState<string>('Australia/Brisbane');
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from('user_projects').select('timezone').eq('id', projectId).single();
      if (!cancelled && data?.timezone) setProjectTZ(data.timezone);
    })();
    return () => { cancelled = true; };
  }, [projectId]);

  /* ---------- Local optimistic + realtime live ---------- */
  const [optimistic, setOptimistic] = useState<any[]>([]);
  const [live, setLive] = useState<any[]>([]);
  const [userInputs, setUserInputs] = useState<any[]>([]);

  useEffect(() => {
    const channel = supabase
      .channel(`zeta_conversation_log:${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'zeta_conversation_log', filter: `project_id=eq.${projectId}` },
        (payload: any) => {
          const r = payload.new;
          const role = (r.role ?? (r.sender ? String(r.sender).toLowerCase() : 'assistant')) as 'user' | 'assistant';
          const message = r.message ?? r.content ?? r.text ?? '';
          const when = r.timestamp ?? r.created_at ?? r.inserted_at ?? new Date().toISOString();

          setLive((prev) => {
            const row = { id: r.id, role, message, timestamp: when, source: 'live' as const };
            const idx = prev.findIndex((x) => String(x.id) === String(r.id));
            if (idx === -1) return [...prev, row];
            const cp = prev.slice(); cp[idx] = { ...cp[idx], ...row }; return cp;
          });
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [projectId]);

  /* ---------- Outreach feed ---------- */
  const [outreach, setOutreach] = useState<any[]>([]);
  useEffect(() => {
    let canceled = false;
    (async () => {
      const { data, error } = await supabase
        .from('outreach_chats')
        .select('id, project_id, message, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true });
      if (!canceled && !error && Array.isArray(data)) {
        setOutreach(
          data.map((r) => ({
            id: r.id,
            role: 'assistant',
            message: r.message,
            timestamp: r.created_at,
            source: 'outreach' as const,
          }))
        );
      }
    })();
    return () => { canceled = true; };
  }, [projectId]);

  /* ---------- user_input_log fetch + realtime ---------- */
  useEffect(() => {
    let canceled = false;
    (async () => {
      const { data } = await supabase
        .from('user_input_log')
        .select('id, content, created_at, timestamp')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
        .order('timestamp', { ascending: true, nullsFirst: true })
        .limit(500);

      if (!canceled && Array.isArray(data)) {
        setUserInputs(
          data.map((r) => ({
            id: `uil-${r.id}`,
            role: 'user',
            message: r.content,
            timestamp: r.timestamp ?? r.created_at ?? new Date().toISOString(),
            source: 'user_input_log' as const,
          }))
        );
      }
    })();

    const ch = supabase
      .channel(`user_input_log:${projectId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'user_input_log', filter: `project_id=eq.${projectId}` },
        (payload: any) => {
          const r = payload.new;
          setUserInputs((prev) => [
            ...prev,
            {
              id: `uil-${r.id}`,
              role: 'user',
              message: r.content,
              timestamp: r.timestamp ?? r.created_at ?? new Date().toISOString(),
              source: 'user_input_log' as const,
            },
          ]);
        }
      )
      .subscribe();

    return () => {
      canceled = true;
      supabase.removeChannel(ch);
    };
  }, [projectId]);

  /* ---------- Reconcile optimistic vs incoming ---------- */
  useEffect(() => {
    if (!optimistic.length) return;
    setOptimistic((prev) =>
      prev.filter((o) => {
        const oRole = o.role ?? 'user';
        const oText = normText(getMsgContent(o));
        const oTime = toDateOrNow(o).getTime();

        const within = (m: any) =>
          (m?.role ?? 'assistant') === oRole &&
          normText(getMsgContent(m)) === oText &&
          Math.abs(toDateOrNow(m).getTime() - oTime) < 120000;

        const base = Array.isArray(messagesProp) ? messagesProp : [];
        const matchedInParent = base.some(within);
        const matchedInLive = live.some(within);
        const matchedInUIL = userInputs.some(within);

        return !(matchedInParent || matchedInLive || matchedInUIL);
      })
    );
  }, [messagesProp, live, userInputs]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Combine feeds ---------- */
  const combined = useMemo(() => {
    const base = (Array.isArray(messagesProp) ? messagesProp : []).map((m) => ({ ...m, source: 'base' as const }));
    const merged = [...base, ...outreach, ...live, ...userInputs, ...optimistic];

    const out: any[] = [];
    const byId = new Map<string, number>();

    const sourcePriority: Record<string, number> = { live: 4, base: 3, user_input_log: 2, outreach: 1, optimistic: 0 };
    const roleRank = (r?: string) => (r === 'user' ? 0 : r === 'assistant' ? 1 : 2);

    const pushOrMerge = (m: any) => {
      const id = m?.id && String(m.id);
      const role = m?.role ?? 'assistant';
      const text = normText(getMsgContent(m));
      const time = toDateOrNow(m).getTime();
      const src = m?.source ?? 'base';
      const hasRealId = !!id && !id.startsWith('temp-') && !id.startsWith('uil-');

      if (id && hasRealId) {
        const existingIndex = byId.get(id);
        if (existingIndex != null) {
          out[existingIndex] = { ...out[existingIndex], ...m };
          return;
        }
      }

      const idx = out.findIndex((u) => {
        return (
          (u?.role ?? 'assistant') === role &&
          normText(getMsgContent(u)) === text &&
          Math.abs(toDateOrNow(u).getTime() - time) < 120000
        );
      });

      if (idx === -1) {
        const newIndex = out.push(m) - 1;
        if (id && hasRealId) byId.set(id, newIndex);
        return;
      }

      const existing = out[idx];
      const existingHasRealId =
        !!existing?.id &&
        !String(existing.id).startsWith('temp-') &&
        !String(existing.id).startsWith('uil-');
      const existingTime = toDateOrNow(existing).getTime();
      const existingSrc = existing?.source ?? 'base';

      const incomingWins =
        (!existingHasRealId && hasRealId) ||
        time > existingTime ||
        (time === existingTime && (sourcePriority[src] ?? 0) > (sourcePriority[existingSrc] ?? 0));

      if (incomingWins) {
        out[idx] = m;
        if (id && hasRealId) byId.set(id, idx);
      }
    };

    merged.forEach(pushOrMerge);

    out.sort((a, b) => {
      const ta = toDateOrNow(a).getTime();
      const tb = toDateOrNow(b).getTime();
      if (ta !== tb) return ta - tb;
      const pa = sourcePriority[a?.source ?? 'base'] ?? 0;
      const pb = sourcePriority[b?.source ?? 'base'] ?? 0;
      if (pa !== pb) return pa - pb;
      const rr = roleRank(a?.role) - roleRank(b?.role);
      if (rr !== 0) return rr;
      const aId = !!a?.id && !String(a.id).startsWith('temp-') && !String(a.id).startsWith('uil-') ? 1 : 0;
      const bId = !!b?.id && !String(b.id).startsWith('temp-') && !String(b.id).startsWith('uil-') ? 1 : 0;
      return aId - bId;
    });

    return out;
  }, [messagesProp, outreach, live, userInputs, optimistic]);

  /* ---------- attachments ---------- */
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [library, setLibrary] = useState<Array<{ id: string; file_name: string; file_url: string; created_at?: string }>>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState('');
  const [selectedDocs, setSelectedDocs] = useState<Uploaded[]>([]);
  const [uploading, setUploading] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoUploadOnSend = true;

  const refreshLibrary = async () => {
    setLibraryLoading(true);
    const { data, error } = await supabase
      .from('documents')
      .select('id, file_name, file_url, created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (!error && Array.isArray(data)) setLibrary(data as any);
    setLibraryLoading(false);
  };

  useEffect(() => { if (libraryOpen) void refreshLibrary(); }, [libraryOpen]); // eslint-disable-line

  const filteredLibrary = useMemo(() => {
    const q = libraryQuery.trim().toLowerCase();
    if (!q) return library;
    return library.filter((d) => d.file_name.toLowerCase().includes(q));
  }, [libraryQuery, library]);

  const addSelectedDoc = (doc: { file_name: string; file_url: string }) => {
    if (selectedDocs.some((d) => d.file_url === doc.file_url)) return;
    setSelectedDocs((prev) => [...prev, { file_name: doc.file_name, file_url: doc.file_url }]);
  };
  const removeSelectedDoc = (file_url: string) => {
    setSelectedDocs((prev) => prev.filter((d) => d.file_url !== file_url));
  };

  const uploadAttachments = async (): Promise<Uploaded[]> => {
    if (!attachedFiles.length) return [];
    setUploading(true);
    try {
      const uploaded: Uploaded[] = [];
      for (const f of attachedFiles) {
        const path = `${projectId}/${Date.now()}_${encodeURIComponent(f.name)}`;
        const { error: upErr } = await supabase.storage.from('project-docs').upload(path, f, { cacheControl: '3600', upsert: false });
        if (upErr) throw upErr;
        const { data: pub } = supabase.storage.from('project-docs').getPublicUrl(path);
        const file_url = pub?.publicUrl ?? '';
        const { error: insErr } = await supabase.from('documents').insert({ project_id: projectId, file_name: f.name, file_url });
        if (insErr) throw insErr;
        uploaded.push({ file_name: f.name, file_url });
      }
      return uploaded;
    } finally {
      setUploading(false);
      setAttachedFiles([]);
    }
  };

  /* ---------- LOCAL LOADING STATE ---------- */
  const [uiLoading, setUiLoading] = useState(false);
  const lastSendAtRef = useRef<number | null>(null);
  const uiLoadingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!uiLoading || !lastSendAtRef.current) return;
    const lastAssistant = [...combined].reverse().find(m => m.role === 'assistant');
    const ts = lastAssistant ? toDateOrNow(lastAssistant).getTime() : 0;
    if (ts && ts >= (lastSendAtRef.current - 1000)) {
      setUiLoading(false);
      lastSendAtRef.current = null;
      if (uiLoadingTimerRef.current) { clearTimeout(uiLoadingTimerRef.current); uiLoadingTimerRef.current = null; }
    }
  }, [combined, uiLoading]);

  const isLoading = Boolean(loading || refreshing || uiLoading);

  /* ---------- input / send ---------- */
  const [isAtBottom, setIsAtBottom] = useState(true);
  const pendingScrollAfterSendRef = useRef(false);

  const handleSend = async () => {
    const userText = normText(props.input ?? '');
    let uploaded: Uploaded[] = [];

    if (autoUploadOnSend && attachedFiles.length) {
      try {
        uploaded = await uploadAttachments();
      } catch {
        alert('Upload failed. Try again.');
        return;
      }
    }

    const parentLast = (Array.isArray(messagesProp) ? messagesProp : []).slice(-1)[0];
    const parentEcho =
      parentLast &&
      (parentLast.role ?? '') === 'user' &&
      normText(getMsgContent(parentLast)) === userText &&
      Math.abs(toDateOrNow(parentLast).getTime() - Date.now()) < 5000;

    if (userText && !parentEcho) {
      setOptimistic((prev) => [
        ...prev,
        { id: `temp-${Date.now()}`, role: 'user', message: userText, timestamp: new Date().toISOString(), source: 'optimistic' as const },
      ]);
    }

    pendingScrollAfterSendRef.current = true;

    setUiLoading(true);
    lastSendAtRef.current = Date.now();
    if (uiLoadingTimerRef.current) clearTimeout(uiLoadingTimerRef.current);
    uiLoadingTimerRef.current = setTimeout(() => {
      setUiLoading(false);
      lastSendAtRef.current = null;
    }, 45000);

    try {
      const allAttachments = [...selectedDocs, ...uploaded];
      await sendMessage(allAttachments.length ? { attachments: allAttachments, verbosity } : { verbosity });
      setSelectedDocs([]);
      setInput('');
      await onRefresh?.();
    } catch {
      setUiLoading(false);
      lastSendAtRef.current = null;
      if (uiLoadingTimerRef.current) { clearTimeout(uiLoadingTimerRef.current); uiLoadingTimerRef.current = null; }
    }
  };

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSend(); }
    else { handleKeyDown(e); }
  };

  const togglePinMessage = (msg: any) => {
    const key = `${normText(getMsgContent(msg))}|${toDateOrNow(msg).getTime()}|${msg?.role ?? ''}`;
    const isPinned = pinnedMessages.some((m) => `${normText(getMsgContent(m))}|${toDateOrNow(m).getTime()}|${m?.role ?? ''}` === key);
    setPinnedMessages((prev) => (isPinned ? prev.filter((m) => `${normText(getMsgContent(m))}|${toDateOrNow(m).getTime()}|${m?.role ?? ''}` !== key) : [...prev, msg]));
  };

  /* ---------- Today filter ---------- */
  const now = new Date();
  const displayedMessages = useMemo(() => {
    if (chatView === 'pinned') return pinnedMessages;
    if (chatView === 'all') return combined;

    const todayList = combined.filter((m) => sameDayInTZ(toDateOrNow(m), now, projectTZ));
    return todayList.length ? todayList : combined.slice(-200);
  }, [chatView, pinnedMessages, combined, projectTZ, now.getTime()]);

  /* ---------- Derived rows (messages + typing) ---------- */
  const rows = useMemo(() => (isLoading ? [...displayedMessages, { __type: 'typing' as const }] : displayedMessages), [displayedMessages, isLoading]);

  /* ---------- follow-to-bottom behavior ---------- */
  useEffect(() => {
    if (!virtuosoRef.current) return;
    if (rows.length === 0) return;

    if (isAtBottom || pendingScrollAfterSendRef.current) {
      pendingScrollAfterSendRef.current = false;
      virtuosoRef.current.scrollToIndex({ index: rows.length - 1, behavior: 'auto' });
    }
  }, [rows.length, isAtBottom]);

  useEffect(() => {
    if (!virtuosoRef.current || !isLoading || !isAtBottom) return;
    virtuosoRef.current.scrollToIndex({ index: rows.length - 1, behavior: 'auto' });
  }, [isLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  if (activeMainTab !== 'chat') return null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tabs + Controls */}
      <div className="flex items-center justify-between px-4 pt-2 md:px-6 md:pt-3">
        <div className="flex items-center gap-2">
          {(['all', 'today', 'pinned'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setChatView(view)}
              className={`text-xs px-3 py-1 rounded-md border transition ${
                chatView === view
                  ? 'bg-blue-600 text-white border-blue-700 shadow'
                  : 'bg-blue-800 text-blue-200 border-blue-500 hover:bg-blue-700'
              }`}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>

        <div className="text-xs text-white flex items-center">
          <div className="mr-2 flex items-center md:mr-4">
            <span className="opacity-80">Verbosity:</span>
            <select
              className="ml-2 rounded bg-blue-900 border border-blue-500 px-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
              value={verbosity}
              onChange={(e) => setVerbosity(e.target.value as Verbosity)}
            >
              <option value="short">Short</option>
              <option value="normal">Normal</option>
              <option value="long">Long</option>
            </select>
          </div>

          <span className="opacity-80">Font:</span>
          <select
            className="ml-2 rounded bg-blue-900 border border-blue-500 px-2 py-1 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value as 'sm' | 'base' | 'lg')}
          >
            <option value="sm">Small</option>
            <option value="base">Medium</option>
            <option value="lg">Large</option>
          </select>
        </div>
      </div>

      {/* Hide/Show */}
      <div className="flex justify-end gap-2 px-4 pt-2 md:px-6">
        <button
          onClick={() => setChatHidden(!chatHidden)}
          className={`text-xs text-white px-3 py-1 rounded-md transition ${
            chatHidden ? 'bg-green-600 hover:bg-green-700' : 'bg-black hover:bg-gray-800'
          }`}
        >
          {chatHidden ? 'Show Chat' : 'Hide Chat'}
        </button>
      </div>

      {/* Body */}
      <div className="flex min-h-0 flex-col px-4 pt-2 pb-2 md:px-6">
        {!chatHidden && (
          // 👇 give the scroller a real height on mobile (fixes “no chat list”)
          <div className="h-[60dvh] min-h-0 overflow-hidden md:h-auto md:flex-1">
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: '100%' }}
              totalCount={rows.length}
              followOutput={isAtBottom ? 'auto' : false}
              atBottomThreshold={120}
              increaseViewportBy={{ top: 120, bottom: 240 }}
              overscan={120}
              atBottomStateChange={setIsAtBottom}
              components={{ Scroller: StableScroller, Footer: FooterSpacer }}
              computeItemKey={(index) => {
                const r = (rows as any[])[index];
                if (r?.__type === 'typing') return 'typing-row';
                const m = r;
                const key =
                  m?.id ??
                  `${(normalizeToDate(rawTs(m)) ?? new Date()).getTime()}|${m?.role ?? 'norole'}|${index}|${normText(getMsgContent(m)).slice(0, 32)}`;
                return key;
              }}
              itemContent={(index) => {
                const r = (rows as any[])[index];

                // Typing row
                if (r?.__type === 'typing') {
                  return (
                    <div className="mb-5 md:mb-6">
                      <TypingBubble />
                    </div>
                  );
                }

                // Normal message
                const msg = r;
                const contentRaw = getMsgContent(msg);
                const latestAssistantIndex = [...displayedMessages].reverse().findIndex((m) => m.role === 'assistant' && getMsgContent(m));
                const isLatestAssistant = index === rows.length - 1 - latestAssistantIndex - (isLoading ? 1 : 0);

                if (isLatestAssistant && msg.role === 'assistant' && contentRaw) {
                  const formatted = formatMathMarkdown(contentRaw);
                  const formatCounts = detectLatexFormats(formatted);
                  console.log('📐 Latex formats:', formatCounts);
                }

                const bubbleCommon = 'relative max-w-[90%] md:max-w-[85%] break-words shadow-md rounded-2xl border transition';
                const bubbleByRole = isUserish(msg)
                  ? 'ml-auto bg-gradient-to-br from-blue-200 to-blue-100 border-blue-300 text-blue-900'
                  : 'bg-gradient-to-br from-yellow-300 to-yellow-100 border-yellow-400 text-slate-900';

                return (
                  <div className="mb-4 md:mb-6">
                    <div className={`${bubbleCommon} ${bubbleByRole} ${textScale(fontSize)} p-3 md:p-4 pb-6`}>
                      <button
                        onClick={() => togglePinMessage(msg)}
                        className="absolute right-2 top-1 text-[11px] text-gray-400 hover:text-yellow-500"
                        title="Pin / Unpin"
                      >
                        📌
                      </button>

                      {msg.role === 'assistant' ? (
                        <div className={`prose ${proseScale(fontSize)} prose-headings:font-semibold prose-p:my-3 max-w-none text-slate-900`}>
                          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                            {formatMathMarkdown(contentRaw)}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <div className={`prose ${proseScale(fontSize)} prose-p:my-3 max-w-none ${isUserish(msg) ? 'text-blue-900' : 'text-slate-900'}`}>
                          <ReactMarkdown>{contentRaw}</ReactMarkdown>
                        </div>
                      )}

                      <div className="absolute bottom-2 right-2 select-none text-[10px] text-gray-500">
                        {formatTimeInTZ(rawTs(msg), projectTZ)}
                      </div>
                    </div>
                  </div>
                );
              }}
            />
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input + Attachments + Emoji */}
      <div className="rounded-b-2xl border-t border-blue-700 bg-blue-900 px-3 pt-3 pb-5 md:px-4">
        {selectedDocs.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {selectedDocs.map((d) => (
              <span key={d.file_url} className="flex items-center gap-2 rounded-lg bg-blue-700 px-2 py-1 text-xs text-white/90">
                <span className="max-w-[220px] truncate">{d.file_name}</span>
                <button onClick={() => removeSelectedDoc(d.file_url)} className="rounded px-1 hover:bg-blue-600" title="Remove">✖</button>
              </span>
            ))}
          </div>
        )}

        <div className="relative flex items-center gap-2">
          <button onClick={() => setLibraryOpen(true)} className="rounded-xl bg-blue-800 px-2 py-2 text-sm text-white shadow transition hover:bg-blue-700" title="Attach files">📎</button>
          <button onClick={() => fileInputRef.current?.click()} className="rounded-xl bg-blue-800 px-2 py-2 text-sm text-white shadow transition hover:bg-blue-700" title="Upload new file">⬆️</button>
          <input ref={fileInputRef} type="file" multiple onChange={(e) => setAttachedFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])} className="hidden" />
          <EmojiButton inputRef={inputRef} setInput={setInput} />

          <input
            ref={inputRef}
            type="text"
            className="w-full rounded-xl border-2 border-blue-300 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Ask Zeta something..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            disabled={uploading}
          />

          <button
            onClick={handleSend}
            disabled={uploading}
            className="rounded-xl bg-blue-600 px-4 py-2 text-white shadow transition hover:bg-blue-700 active:scale-[0.98] disabled:opacity-60"
          >
            Send
          </button>
        </div>

        {attachedFiles.length > 0 && (
          <div className="mt-2 text-xs text-blue-100">
            Pending upload: {attachedFiles.map((f) => f.name).join(', ')}
          </div>
        )}
      </div>

      {/* Library modal */}
      {libraryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setLibraryOpen(false)} />
          <div className="relative max-h-[80vh] w-[min(780px,92vw)] overflow-hidden rounded-2xl border border-blue-700 bg-blue-950 shadow-2xl">
            <div className="flex items-center justify-between border-b border-blue-800 px-4 py-3">
              <div className="font-semibold text-white">Attach files from Library</div>
              <button onClick={() => setLibraryOpen(false)} className="text-sm text-blue-200 hover:text-white">Close</button>
            </div>

            <div className="p-4">
              <div className="mb-3 flex gap-2">
                <input
                  value={libraryQuery}
                  onChange={(e) => setLibraryQuery(e.target.value)}
                  placeholder="Search files…"
                  className="flex-1 rounded-lg border border-blue-700 bg-blue-900/60 px-3 py-2 text-sm text-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={() => { setLibraryQuery(''); refreshLibrary(); }} className="rounded-lg border border-blue-700 bg-blue-800 px-3 py-2 text-sm text-white hover:bg-blue-700">Refresh</button>
              </div>

              <div className="max-h-[48vh] overflow-auto rounded-lg border border-blue-800">
                {libraryLoading ? (
                  <div className="p-6 text-sm text-blue-200">Loading…</div>
                ) : filteredLibrary.length === 0 ? (
                  <div className="p-6 text-sm text-blue-300">No files found.</div>
                ) : (
                  <table className="w-full text-sm text-blue-100">
                    <thead className="sticky top-0 bg-blue-900/60">
                      <tr>
                        <th className="w-10 px-3 py-2 text-left">Add</th>
                        <th className="px-3 py-2 text-left">File name</th>
                        <th className="w-40 px-3 py-2 text-left">Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredLibrary.map((doc) => {
                        const already = selectedDocs.some((d) => d.file_url === doc.file_url);
                        return (
                          <tr key={doc.id} className="odd:bg-blue-900/20">
                            <td className="px-3 py-2">
                              <button
                                onClick={() => addSelectedDoc(doc)}
                                disabled={already}
                                className={`rounded px-2 py-1 ${already ? 'cursor-not-allowed bg-green-800/40 text-green-300' : 'bg-blue-800 text-white hover:bg-blue-700'}`}
                              >
                                {already ? 'Added' : 'Add'}
                              </button>
                            </td>
                            <td className="truncate px-3 py-2">{doc.file_name}</td>
                            <td className="px-3 py-2">{doc.created_at ? new Date(doc.created_at).toLocaleString() : '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between">
                <div className="flex flex-wrap gap-2">
                  {selectedDocs.map((d) => (
                    <span key={d.file_url} className="rounded-md bg-blue-800 px-2 py-1 text-[11px] text-blue-100">{d.file_name}</span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedDocs([])} className="rounded-lg bg-blue-900 px-3 py-2 text-sm text-blue-200 hover:bg-blue-800 border border-blue-700">Clear</button>
                  <button onClick={() => setLibraryOpen(false)} className="rounded-lg bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">Done</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

/* ---------- Emoji Button ---------- */
function EmojiButton({
  inputRef,
  setInput,
}: {
  inputRef: React.RefObject<HTMLInputElement | null>;
  setInput: (s: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [align, setAlign] = useState<'center' | 'left' | 'right'>('center');
  const btnWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest?.('[data-emoji-root]')) setOpen(false);
    }
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  useEffect(() => {
    if (!open) return;
    const wrap = btnWrapRef.current;
    if (!wrap) return;

    const WRAP_MARGIN = 8;
    const PANEL_W = 224;
    const r = wrap.getBoundingClientRect();

    const centerLeft = r.left + r.width / 2 - PANEL_W / 2;
    const centerRight = centerLeft + PANEL_W;

    if (centerLeft < WRAP_MARGIN) setAlign('left');
    else if (centerRight > window.innerWidth - WRAP_MARGIN) setAlign('right');
    else setAlign('center');
  }, [open]);

  const onPick = (emoji: string) => {
    const el = inputRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const val = el.value;
    const next = val.slice(0, start) + emoji + val.slice(end);
    setInput(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + emoji.length;
      el.setSelectionRange(pos, pos);
    });
  };

  return (
    <div className="relative" data-emoji-root ref={btnWrapRef}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        className="rounded-xl bg-blue-800 px-2 py-2 text-sm text-white shadow transition hover:bg-blue-700"
        title="Emoji"
      >
        🙂
      </button>

      {open && (
        <div
          className={[
            'absolute z-50 bottom-full mb-2 w-56 rounded-xl border border-blue-700 bg-blue-950 p-2 shadow-xl',
            align === 'center' ? 'left-1/2 -translate-x-1/2' : '',
            align === 'left' ? 'left-0' : '',
            align === 'right' ? 'right-0' : '',
          ].join(' ')}
        >
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((emo) => (
              <button
                key={emo}
                className="rounded p-1 text-xl leading-none hover:bg-blue-800"
                onClick={() => onPick(emo)}
                title={emo}
                type="button"
              >
                {emo}
              </button>
            ))}
          </div>
          <div className="mt-2 px-1 text-[10px] text-blue-300">Click an emoji to insert at cursor</div>
        </div>
      )}
    </div>
  );
}

/* ---------- Typing bubble ---------- */
function TypingBubble() {
  return (
    <div className="mb-1">
      <div className="relative rounded-2xl border bg-gradient-to-br from-yellow-300 to-yellow-100 p-4 pb-6 text-slate-900 shadow-md transition">
        <div className="flex items-center gap-2 text-[15px]">
          <span className="font-medium">Zeta is thinking</span>
          <span className="ml-1 inline-flex h-[1em] items-end gap-1">
            <span className="typing-dot" style={{ animationDelay: '0ms' }} />
            <span className="typing-dot" style={{ animationDelay: '120ms' }} />
            <span className="typing-dot" style={{ animationDelay: '240ms' }} />
          </span>
        </div>
        <div className="absolute bottom-2 right-2 select-none text-[10px] text-gray-500">…</div>

        <style jsx>{`
          .typing-dot {
            width: 0.375rem;
            height: 0.375rem;
            border-radius: 9999px;
            background: rgba(51, 65, 85, 0.7);
            display: inline-block;
            animation: zeta-bounce-dot 1s ease-in-out infinite;
            transform-origin: center;
          }
          @keyframes zeta-bounce-dot {
            0%, 80%, 100% { transform: translateY(0); opacity: 0.7; }
            40%           { transform: translateY(-6px); opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) { .typing-dot { animation: none; } }
        `}</style>
      </div>
    </div>
  );
}

export default ChatTab;
