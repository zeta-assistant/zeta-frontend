'use client';

import React, { useState, useRef, useEffect } from 'react';
import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { formatMathMarkdown } from '@/lib/formatMathMarkdown';
import { detectLatexFormats } from '@/lib/latexDetector';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { supabase } from '@/lib/supabaseClient';

type Uploaded = { file_name: string; file_url: string };

interface ChatTabProps {
  activeMainTab: string;
  chatView: 'all' | 'today' | 'pinned';
  setChatView: React.Dispatch<React.SetStateAction<'all' | 'today' | 'pinned'>>;
  chatHidden: boolean;
  setChatHidden: React.Dispatch<React.SetStateAction<boolean>>;
  messages: any[];
  loading: boolean;
  input: string;
  setInput: (text: string) => void;
  handleKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  sendMessage: (opts?: { attachments?: Uploaded[] }) => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  fontSize: 'sm' | 'base' | 'lg';
  setFontSize: React.Dispatch<React.SetStateAction<'sm' | 'base' | 'lg'>>;
  projectId: string;

  // NEW: for inline refresh
  onRefresh: () => Promise<void>;
  refreshing?: boolean;
}

const proseScale = (fs: 'sm' | 'base' | 'lg') =>
  fs === 'sm' ? 'prose-sm' : fs === 'lg' ? 'prose-lg' : 'prose';
const textScale = (fs: 'sm' | 'base' | 'lg') =>
  fs === 'sm' ? 'text-[13px] leading-6' : fs === 'lg' ? 'text-[16.5px] leading-8' : 'text-[15px] leading-7';

const ChatTab: React.FC<ChatTabProps> = (props) => {
  const {
    activeMainTab, chatView, setChatView, chatHidden, setChatHidden,
    messages, loading, input, setInput, handleKeyDown, sendMessage,
    scrollRef, fontSize, setFontSize, projectId, onRefresh, refreshing,
  } = props;

  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  // Attachments
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoUploadOnSend = true;

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) setAttachedFiles((prev) => [...prev, ...files]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  const removeAttachment = (idx: number) => setAttachedFiles((p) => p.filter((_, i) => i !== idx));

  const isImage = (name: string) => /\.(png|jpe?g|webp|gif)$/i.test(name);
  const buildFilesMarkdown = (atts: Uploaded[]) => {
    const lines: string[] = ['📎 Files attached:'];
    for (const a of atts) {
      if (isImage(a.file_name)) lines.push(`![${a.file_name}](${a.file_url})`);
      else lines.push(`- [${a.file_name}](${a.file_url})`);
    }
    return lines.join('\n');
  };

  const uploadAttachments = async (): Promise<Uploaded[]> => {
    if (!attachedFiles.length) return [];
    setUploading(true);
    try {
      const uploaded: Uploaded[] = [];
      for (const f of attachedFiles) {
        const path = `${projectId}/${Date.now()}_${encodeURIComponent(f.name)}`;
        const { error: upErr } = await supabase.storage.from('project-docs').upload(path, f, {
          cacheControl: '3600',
          upsert: false,
        });
        if (upErr) throw upErr;

        const { data: pub } = supabase.storage.from('project-docs').getPublicUrl(path);
        const file_url = pub?.publicUrl ?? '';

        const { error: insErr } = await supabase.from('documents').insert({
          project_id: projectId,
          file_name: f.name,
          file_url,
        });
        if (insErr) throw insErr;

        uploaded.push({ file_name: f.name, file_url });
      }
      return uploaded;
    } finally {
      setUploading(false);
      setAttachedFiles([]);
    }
  };

  const handleSend = async () => {
  let uploaded: Uploaded[] = [];
  if (autoUploadOnSend && attachedFiles.length) {
    try {
      uploaded = await uploadAttachments();
    } catch (e) {
      console.error('📎 Upload failed:', e);
      alert('Upload failed. Try again.');
      return;
    }
  }

  await sendMessage(uploaded.length ? { attachments: uploaded } : undefined);
  await onRefresh(); // 👈 🔥 THIS LINE makes it real-time

  requestAnimationFrame(() => {
    virtuosoRef.current?.scrollToIndex({
      index: Math.max(0, displayedMessages.length),
      behavior: 'smooth',
    });
  });
};

  const onInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSend();
    } else {
      handleKeyDown(e);
    }
  };

  const togglePinMessage = (msg: any) => {
    const isPinned = pinnedMessages.some((m) => m.timestamp === msg.timestamp);
    setPinnedMessages((prev) => (isPinned ? prev.filter((m) => m.timestamp !== msg.timestamp) : [...prev, msg]));
  };

  const displayedMessages =
    chatView === 'pinned'
      ? pinnedMessages
      : messages.filter((msg) => {
          if (chatView === 'all') return true;
          const msgDate = new Date(msg.timestamp).toDateString();
          const today = new Date().toDateString();
          return msgDate === today;
        });

  useEffect(() => {
    const t = setTimeout(() => {
      if (virtuosoRef.current && displayedMessages.length > 0) {
        virtuosoRef.current.scrollToIndex({
          index: displayedMessages.length - 1,
          behavior: 'smooth',
        });
      }
    }, 150);
    return () => clearTimeout(t);
  }, [chatHidden, activeMainTab, displayedMessages.length]);

  if (activeMainTab !== 'chat') return null;

  const isUserish = (msg: any) =>
    msg.role === 'user' ||
    (msg.role === 'system' && typeof msg.content === 'string' && msg.content.startsWith('📎 Files attached'));

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Tabs + Inline Refresh */}
      <div className="flex justify-between items-center px-6 pt-3">
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
    <span className="opacity-80">Font:</span>
    <select
      className="ml-2 px-2 py-1 rounded bg-blue-900 border border-blue-500 text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
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
      <div className="flex justify-end gap-2 px-6 pt-2">
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
      <div className="flex flex-col flex-1 min-h-0 px-6 pt-2 pb-2">
        {!chatHidden && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: '100%' }}
              totalCount={displayedMessages.length}
              followOutput="smooth"
              atBottomThreshold={200}
              increaseViewportBy={{ top: 0, bottom: 400 }}
              overscan={200}
              components={{ Footer: () => <div style={{ height: 24 }} /> }}
              itemContent={(index) => {
                const msg = displayedMessages[index];
                const isPinned = pinnedMessages.some((m) => m.timestamp === msg.timestamp);

                const latestAssistantIndex = [...displayedMessages]
                  .reverse()
                  .findIndex((m) => m.role === 'assistant' && m.content);
                const isLatestAssistant = index === displayedMessages.length - 1 - latestAssistantIndex;

                if (isLatestAssistant && msg.role === 'assistant' && msg.content) {
                  const formatted = formatMathMarkdown(msg.content);
                  const formatCounts = detectLatexFormats(formatted);
                  console.log('📐 Latex Formats in Latest Assistant Message:', formatCounts);
                }

                const bubbleCommon = 'relative max-w-[85%] break-words shadow-md rounded-2xl border transition';
                const bubbleByRole = isUserish(msg)
                  ? 'ml-auto bg-gradient-to-br from-blue-200 to-blue-100 border-blue-300 text-blue-900'
                  : 'bg-gradient-to-br from-yellow-300 to-yellow-100 border-yellow-400 text-slate-900';

                return (
                  <div key={msg.timestamp ?? index} className="mb-5 md:mb-6">
                    <div className={`${bubbleCommon} ${bubbleByRole} ${textScale(fontSize)} p-4 pb-6`}>
                      <button
                        onClick={() => togglePinMessage(msg)}
                        className="absolute top-1 right-2 text-[11px] text-gray-400 hover:text-yellow-500"
                        title={isPinned ? 'Unpin' : 'Pin'}
                      >
                        📌
                      </button>

                      {msg.role === 'assistant' ? (
                        <div className={`prose ${proseScale(fontSize)} prose-headings:font-semibold prose-p:my-3 max-w-none text-slate-900`}>
                          {msg.math_blocks?.length > 0 ? (
                            <div className="space-y-3">
                              {msg.math_blocks.map((block: string, i: number) => (
                                <div key={i} className="bg-white rounded-lg p-3 border border-blue-200 shadow-sm">
                                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                                    {`$$${block}$$`}
                                  </ReactMarkdown>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                              {formatMathMarkdown(msg.content)}
                            </ReactMarkdown>
                          )}
                        </div>
                      ) : (
                        <div className={`prose ${proseScale(fontSize)} prose-p:my-3 max-w-none ${isUserish(msg) ? 'text-blue-900' : 'text-slate-900'}`}>
                          <ReactMarkdown
                            components={{
                              a: ({ href, children }) => (
                                <a href={href ?? '#'} target="_blank" rel="noopener noreferrer" className="underline">
                                  {children}
                                </a>
                              ),
                              img: ({ src, alt }) => (
                                <img
                                  src={src ?? ''}
                                  alt={alt ?? ''}
                                  loading="lazy"
                                  className="mt-2 max-h-48 w-auto rounded-lg border border-blue-200 shadow-sm object-contain"
                                />
                              ),
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        </div>
                      )}

                      {msg.timestamp && (
                        <div className="absolute bottom-2 right-2 text-[10px] text-gray-500 select-none">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          </div>
        )}

        {loading && !chatHidden && (
          <div className="max-w-[85%] px-4 py-3 rounded-2xl text-sm bg-blue-800 text-white animate-pulse mt-2">
            Zeta is thinking...
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Input + Attachments */}
      <div className="border-t border-blue-700 bg-blue-900 px-4 pt-3 pb-5 rounded-b-2xl">
        {attachedFiles.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {attachedFiles.map((f, i) => (
              <span
                key={`${f.name}-${i}`}
                className="inline-flex items-center gap-2 bg-blue-800 text-blue-100 border border-blue-600 rounded-full px-3 py-1 text-xs"
                title={f.name}
              >
                📎 {f.name.length > 28 ? f.name.slice(0, 25) + '…' : f.name}
                <button
                  onClick={() => removeAttachment(i)}
                  className="ml-1 rounded-full bg-blue-700 px-2 py-[2px] text-[10px] hover:bg-blue-600"
                  aria-label="Remove file"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center justify-center w-11 h-11 rounded-xl border border-blue-600 bg-blue-800 text-white hover:bg-blue-700 active:scale-[0.98] transition"
            title="Attach files"
            aria-label="Attach files"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
              <path d="M16.5 6.5l-7.78 7.78a3 3 0 104.24 4.24L19 12.5a5 5 0 10-7.07-7.07L6.64 10.71"
                fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept=".pdf,.txt,.md,.csv,.tsv,.json,.doc,.docx,.xls,.xlsx,.ppt,.pptx,image/*"
            onChange={onPickFiles}
          />

          <input
            type="text"
            className="bg-blue-50 text-blue-900 border-2 border-blue-300 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm w-full shadow-sm"
            placeholder="Ask Zeta something..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onInputKeyDown}
            disabled={uploading}
          />

          <button
            onClick={handleSend}
            disabled={uploading}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl shadow hover:bg-blue-700 active:scale-[0.98] transition disabled:opacity-60"
          >
            {uploading ? 'Uploading…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatTab;