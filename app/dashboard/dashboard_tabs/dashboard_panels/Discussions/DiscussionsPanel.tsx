'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { NewDiscussionForm } from '@/components/tab_components/NewDiscussionForm';
import { ThreadChatTab } from '@/components/tab_components/ThreadChatTab';

type Discussion = {
  thread_id: string;
  title: string;
};

export default function DiscussionsPanel({ fontSize }: { fontSize: 'sm' | 'base' | 'lg' }) {
  const { projectId } = useParams();
  const [discussions, setDiscussions] = useState<Discussion[]>([]);
  const [selectedThread, setSelectedThread] = useState<Discussion | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('discussions')
        .select('thread_id, title')
        .eq('project_id', projectId)
        .order('last_updated', { ascending: false });
      setDiscussions(data || []);
    })();
  }, [projectId]);

  const deleteDiscussion = async (threadId: string) => {
    const { error } = await supabase
      .from('discussions')
      .delete()
      .eq('thread_id', threadId);

    if (error) {
      console.error('❌ Error deleting discussion:', error.message);
      return;
    }

    setDiscussions((prev) => prev.filter((d) => d.thread_id !== threadId));
    setSelectedThread(null);
  };

  if (showNewForm) {
    return (
      <div className={`p-6 text-${fontSize} text-indigo-200 bg-blue-950`}>
        <h2 className="text-lg text-white font-semibold mb-4">➕ Start a New Discussion</h2>
        <NewDiscussionForm
          onCreate={async (newDiscussion: Discussion) => {
            setShowNewForm(false);

            // ⏳ Wait until thread is confirmed in DB before rendering chat
            let retries = 0;
            let exists = false;

            while (!exists && retries < 10) {
              const { data } = await supabase
                .from('threads')
                .select('thread_id')
                .eq('thread_id', newDiscussion.thread_id)
                .single();

              if (data) {
                exists = true;
                break;
              }

              await new Promise((r) => setTimeout(r, 500));
              retries++;
            }

            if (!exists) {
              console.error('❌ Thread was never inserted!');
              return;
            }

            setSelectedThread(newDiscussion);

            const { data } = await supabase
              .from('discussions')
              .select('thread_id, title')
              .eq('project_id', projectId)
              .order('last_updated', { ascending: false });
            setDiscussions(data || []);
          }}
        />
        <button
          onClick={() => setShowNewForm(false)}
          className="mt-4 text-sm text-pink-400 hover:text-pink-200"
        >
          ← Cancel
        </button>
      </div>
    );
  }

  if (!selectedThread) {
    return (
      <div className={`p-6 overflow-y-auto text-${fontSize} text-indigo-200 space-y-6 bg-blue-950`}>
        <div className="flex justify-between items-center">
          <h2 className="text-lg text-white font-semibold">💬 Choose a Discussion</h2>
          <button
            onClick={() => setShowNewForm(true)}
            className="bg-pink-600 hover:bg-pink-700 text-white px-3 py-1 rounded shadow text-sm"
          >
            ➕ New Discussion
          </button>
        </div>
        {discussions.length === 0 ? (
          <p className="text-gray-400">No discussions yet.</p>
        ) : (
          discussions.map((d) => (
            <div
              key={d.thread_id}
              onClick={() => setSelectedThread(d)}
              className="cursor-pointer bg-purple-700 hover:bg-purple-800 px-4 py-3 rounded-xl shadow text-white transition"
            >
              {d.title}
            </div>
          ))
        )}
      </div>
    );
  }

  return (
    <div className={`p-6 text-${fontSize} text-indigo-200 space-y-6 bg-blue-950 flex flex-col h-full`}>
      <div className="flex justify-between items-center">
        <h2 className="text-lg text-white font-semibold">
          🧵 Discussion: {selectedThread.title || selectedThread.thread_id}
        </h2>
        <div className="flex gap-3">
          <button
            onClick={() => setSelectedThread(null)}
            className="text-sm text-pink-400 hover:text-pink-200"
          >
            ← Back
          </button>
          <button
            onClick={() => {
              if (confirm('Are you sure you want to delete this discussion?')) {
                deleteDiscussion(selectedThread.thread_id);
              }
            }}
            className="text-sm text-red-400 hover:text-red-200"
          >
            🗑 Delete
          </button>
        </div>
      </div>

      {/* 💬 Modular Chat UI for this discussion */}
      <div className="flex-1 overflow-y-auto">
        <ThreadChatTab threadId={selectedThread.thread_id} fontSize={fontSize} />
      </div>
    </div>
  );
}
