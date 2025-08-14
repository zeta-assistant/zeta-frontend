'use client';

import React, { useState, useRef, useEffect } from 'react';
import 'katex/dist/katex.min.css';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';
import { supabase } from '@/lib/supabaseClient';
import { formatMathMarkdown } from '@/lib/formatMathMarkdown';
import { detectLatexFormats } from '@/lib/latexDetector';

type Message = {
  id?: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at?: string;
};

interface ThreadChatTabProps {
  threadId: string;
  fontSize: 'sm' | 'base' | 'lg';
}

export function ThreadChatTab({ threadId, fontSize }: ThreadChatTabProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const virtuosoRef = useRef<VirtuosoHandle>(null);

  useEffect(() => {
    if (!threadId) return;
    (async () => {
      const { data, error } = await supabase
        .from('discussion_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Failed to fetch messages:', error.message);
        return;
      }
      setMessages(data || []);
    })();
  }, [threadId]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    setLoading(true);
    const inputCopy = input;
    setInput('');

    // Insert user message locally first
    const newUserMsg: Message = {
      id: crypto.randomUUID(),
      thread_id: threadId,
      role: 'user',
      content: inputCopy,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newUserMsg]);

    // Send to API
    try {
      const res = await fetch('/api/discussion-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: inputCopy, threadId }),
      });
      const { reply } = await res.json();

      if (reply) {
        const newAssistantMsg: Message = {
          id: crypto.randomUUID(),
          thread_id: threadId,
          role: 'assistant',
          content: reply,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, newAssistantMsg]);
      }
    } catch (e) {
      console.error('Error sending message:', e);
    } finally {
      setLoading(false);
      setTimeout(() => virtuosoRef.current?.scrollToIndex({ index: messages.length }), 100);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-hidden px-6 pt-2 pb-2">
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          totalCount={messages.length}
          followOutput={true}
          itemContent={(index) => {
            const msg = messages[index];
            if (msg.role === 'assistant' && msg.content) {
              const formatted = formatMathMarkdown(msg.content);
              const diagnostics = detectLatexFormats(formatted);
              console.log('📐 LaTeX diagnostics for message:', diagnostics.counts);
            }

            const bubbleCommon =
              'relative max-w-[85%] whitespace-pre-line overflow-hidden rounded-2xl border shadow-md p-4 pb-6';

            const bubbleByRole =
              msg.role === 'user'
                ? 'ml-auto bg-gradient-to-br from-blue-200 to-blue-100 border-blue-300 text-blue-900'
                : 'mr-auto bg-gradient-to-br from-yellow-300 to-yellow-100 border-yellow-400 text-slate-900';

            return (
              <div key={msg.id ?? index} className="mb-5 md:mb-6">
                <div className={`${bubbleCommon} ${bubbleByRole}`}>
                  <div className={`prose ${msg.role === 'assistant' ? 'text-slate-900' : 'text-blue-900'} max-w-none`}>
                    <ReactMarkdown
                      children={formatMathMarkdown(msg.content)}
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                      components={{
                        p: ({ children }) => <p className="whitespace-pre-wrap">{children}</p>,
                      }}
                    />
                  </div>

                  {msg.created_at && (
                    <div className="absolute bottom-2 right-2 text-[10px] text-gray-500">
                      {new Date(msg.created_at).toLocaleTimeString([], {
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

      {/* Input Bar */}
      <div className="border-t border-blue-700 bg-blue-900 px-4 pt-3 pb-5 rounded-b-2xl">
        <div className="flex gap-2">
          <input
            type="text"
            className="bg-blue-50 text-blue-900 border-2 border-blue-300 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm flex-1 max-w-xl shadow-sm"
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            disabled={loading}
          />
          <button
            onClick={sendMessage}
            className="bg-blue-600 text-white px-4 py-2 rounded-xl shadow hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={loading}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

export default ThreadChatTab;