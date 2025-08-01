'use client';

import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';

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

  if (activeMainTab !== 'chat') return null;

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

  return (
    <>
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

        {/* Font Size Selector */}
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

      {/* Hide/Show Chat Toggle */}
      <div className="flex justify-end gap-2 px-6 pt-2">
        <button
          onClick={() => setChatHidden(!chatHidden)}
          className={`text-xs text-white ${
            chatHidden
              ? 'bg-green-600 hover:bg-green-700'
              : 'bg-black hover:bg-gray-800'
          } px-3 py-1 rounded-md`}
        >
          {chatHidden ? 'Show Chat' : 'Hide Chat'}
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-6 pt-2 pb-4 space-y-3 mt-2">
        {!chatHidden &&
          displayedMessages.map((msg, i) => {
            const isPinned = pinnedMessages.some((m) => m.timestamp === msg.timestamp);
            return (
              <div
                key={i}
                className={`relative max-w-[85%] whitespace-pre-line overflow-hidden text-${fontSize} ${
                  msg.role === 'user'
                    ? 'ml-auto bg-purple-200 text-purple-900 font-plex border border-purple-400 shadow-sm p-4 rounded-xl'
                    : 'bg-zeta-blue text-white font-plex shadow-lg border border-zeta-blue-light px-0 py-0 rounded-xl'
                }`}
              >
                {/* Pin button */}
                <button
                  onClick={() => togglePinMessage(msg)}
                  className="absolute top-1 right-2 text-[10px] text-gray-300 hover:text-yellow-400"
                  title={isPinned ? 'Unpin' : 'Pin'}
                >
                  📌
                </button>

                {msg.role === 'assistant' ? (
                  <div className="bg-yellow-100 text-blue-900 font-plex p-4 m-1 rounded-lg prose prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
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
            );
          })}

        {loading && !chatHidden && (
          <div className="max-w-[85%] px-4 py-3 rounded-xl text-sm bg-blue-800 text-white animate-pulse font-plex">
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
    </>
  );
};

export default ChatTab;