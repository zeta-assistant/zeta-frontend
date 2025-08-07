'use client';

import React, { useState, useRef, useEffect } from 'react';
import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { VariableSizeList as List } from 'react-window';
import { formatMathMarkdown } from '@/lib/formatMathMarkdown';
import { detectLatexFormats } from '@/lib/latexDetector';
import { Virtuoso } from 'react-virtuoso';
import { VirtuosoHandle } from 'react-virtuoso';

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
  sendMessage: () => void;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  fontSize: 'sm' | 'base' | 'lg';
  setFontSize: React.Dispatch<React.SetStateAction<'sm' | 'base' | 'lg'>>;
}

const ChatTab: React.FC<ChatTabProps> = ({
  activeMainTab,
  chatView,
  setChatView,
  chatHidden,
  setChatHidden,
  messages,
  loading,
  input,
  setInput,
  handleKeyDown,
  sendMessage,
  scrollRef,
  fontSize,
  setFontSize,
}) => {
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([]);
  const virtuosoRef = useRef<VirtuosoHandle>(null);
  const [hasScrolledInitially, setHasScrolledInitially] = useState(false);

  const togglePinMessage = (msg: any) => {
    const isPinned = pinnedMessages.some((m) => m.timestamp === msg.timestamp);
    if (isPinned) {
      setPinnedMessages((prev) => prev.filter((m) => m.timestamp !== msg.timestamp));
    } else {
      setPinnedMessages((prev) => [...prev, msg]);
    }
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


  // 🧠 Scroll to bottom on first load
  useEffect(() => {
  const timeout = setTimeout(() => {
    if (virtuosoRef.current && displayedMessages.length > 0) {
      virtuosoRef.current.scrollToIndex({
        index: displayedMessages.length - 1,
        behavior: 'auto',
      });
    }
  }, 150); // 150ms delay ensures DOM and Virtuoso finish layout

  return () => clearTimeout(timeout);
}, [chatHidden, activeMainTab, displayedMessages.length]);

  if (activeMainTab !== 'chat') return null;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Chat View Tabs */}
      <div className="flex justify-between items-center px-6 pt-3">
        <div className="flex gap-2">
          {(['all', 'today', 'pinned'] as const).map((view) => (
            <button
              key={view}
              onClick={() => setChatView(view)}
              className={`text-xs px-3 py-1 rounded-md border ${
                chatView === view
                  ? 'bg-purple-600 text-white border-purple-700'
                  : 'bg-blue-800 text-purple-300 border-purple-500'
              }`}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          ))}
        </div>

        <div className="text-xs text-white">
          Font:
          <select
            className="ml-2 px-2 py-1 rounded bg-blue-900 border border-purple-500 text-white"
            value={fontSize}
            onChange={(e) => setFontSize(e.target.value as 'sm' | 'base' | 'lg')}
          >
            <option value="sm">Small</option>
            <option value="base">Medium</option>
            <option value="lg">Large</option>
          </select>
        </div>
      </div>

      {/* Hide/Show Toggle */}
      <div className="flex justify-end gap-2 px-6 pt-2">
        <button
          onClick={() => setChatHidden(!chatHidden)}
          className={`text-xs text-white ${
            chatHidden ? 'bg-green-600 hover:bg-green-700' : 'bg-black hover:bg-gray-800'
          } px-3 py-1 rounded-md`}
        >
          {chatHidden ? 'Show Chat' : 'Hide Chat'}
        </button>
      </div>

      {/* Chat Body (Virtuoso Virtualized) */}
      <div className="flex flex-col flex-1 min-h-0 px-6 pt-2 pb-2">
        {!chatHidden && (
          <div className="flex-1 min-h-0 overflow-hidden">
            <Virtuoso
              ref={virtuosoRef}
              style={{ height: '100%' }}
              totalCount={displayedMessages.length}
              followOutput={true}
              itemContent={(index) => {
                const msg = displayedMessages[index];
                const isPinned = pinnedMessages.some((m) => m.timestamp === msg.timestamp);
                const latestAssistantIndex = [...displayedMessages]
                  .reverse()
                  .findIndex((m) => m.role === 'assistant' && m.content);
                const isLatestAssistant =
                  index === displayedMessages.length - 1 - latestAssistantIndex;

                if (isLatestAssistant && msg.role === 'assistant' && msg.content) {
                  const formatted = formatMathMarkdown(msg.content);
                  const formatCounts = detectLatexFormats(formatted);
                  console.log('📐 Latex Formats in Latest Assistant Message:', formatCounts);
                }

                return (
                  <div key={msg.timestamp}>
                    <div
                      className={`relative max-w-[85%] whitespace-pre-line overflow-hidden text-${fontSize} ${
                        msg.role === 'user'
                          ? 'ml-auto bg-purple-200 text-purple-900 font-plex border border-purple-400 shadow-sm p-4 rounded-xl'
                          : 'bg-zeta-blue text-white font-plex shadow-lg border border-zeta-blue-light px-0 py-0 rounded-xl'
                      }`}
                    >
                      <button
                        onClick={() => togglePinMessage(msg)}
                        className="absolute top-1 right-2 text-[10px] text-gray-300 hover:text-yellow-400"
                        title={isPinned ? 'Unpin' : 'Pin'}
                      >
                        📌
                      </button>

                      {msg.role === 'assistant' ? (
                        <div className="bg-yellow-100 text-blue-900 font-plex p-4 m-1 rounded-lg">
                          {msg.math_blocks?.length > 0 ? (
                            <div className="space-y-3">
                              {msg.math_blocks.map((block: string, i: number) => (
                                <div key={i} className="bg-white rounded p-2 border border-blue-200">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkMath]}
                                    rehypePlugins={[rehypeKatex]}
                                  >
                                    {`$$${block}$$`}
                                  </ReactMarkdown>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="prose prose-sm max-w-prose mx-auto">
                              <ReactMarkdown
                                remarkPlugins={[remarkMath]}
                                rehypePlugins={[rehypeKatex]}
                              >
                                {formatMathMarkdown(msg.content)}
                              </ReactMarkdown>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className={`prose prose-sm text-purple-900 max-w-none text-${fontSize}`}>
                          {msg.content}
                        </div>
                      )}

                      {msg.timestamp && (
                        <div className="absolute bottom-1 right-3 text-[10px] text-gray-500">
                          {new Date(msg.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
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
          <div className="max-w-[85%] px-4 py-3 rounded-xl text-sm bg-blue-800 text-white animate-pulse font-plex mt-2">
            Zeta is thinking...
          </div>
        )}

        <div ref={scrollRef} />
      </div>

      {/* Chat Input */}
      <div className="border-t border-blue-700 bg-blue-900 px-4 pt-3 pb-5 rounded-b-2xl">
        <div className="flex">
          <input
            type="text"
            className="bg-purple-50 text-purple-900 border-2 border-purple-300 rounded-l-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 font-semibold text-sm w-full max-w-xl shadow-sm"
            placeholder="Ask Zeta something..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={sendMessage}
            className="bg-purple-600 text-white px-4 py-2 rounded-lg shadow hover:bg-purple-700"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatTab;