'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

type File = {
  id: string;
  file_name: string;
};

type Discussion = {
  thread_id: string;
  title: string;
};

export function NewDiscussionForm({
  onCreate,
}: {
  onCreate: (d: Discussion) => void;
}) {
  const { projectId } = useParams();
  const [title, setTitle] = useState('');
  const [availableFiles, setAvailableFiles] = useState<File[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const { data } = await supabase
        .from('documents')
        .select('id, file_name')
        .eq('project_id', projectId);
      setAvailableFiles(data || []);
    })();
  }, [projectId]);

  const handleCreate = async () => {
    if (submitting || !title || !projectId) return;
    setSubmitting(true);

    try {
      const res = await fetch('/api/discussion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          projectId,
          fileId: selectedFileId,
        }),
      });

      const result = await res.json();

      if (!res.ok) {
        console.error('❌ API error creating discussion:', result.error);
        return;
      }

      onCreate({
        thread_id: result.threadId,
        title,
      });
    } catch (err) {
      console.error('❌ Unexpected error:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Enter discussion title..."
        className="w-full p-3 rounded-xl border border-purple-400 bg-blue-950 text-white"
      />

      <label className="block text-purple-300 font-semibold text-sm">📎 Attach a file?</label>
      <select
        value={selectedFileId || ''}
        onChange={(e) => setSelectedFileId(e.target.value || null)}
        className="w-full bg-blue-950 border border-purple-400 rounded-xl p-3 text-white"
      >
        <option value="">No file</option>
        {availableFiles.map((file) => (
          <option key={file.id} value={file.id}>
            {file.file_name}
          </option>
        ))}
      </select>

      <button
        onClick={handleCreate}
        disabled={submitting || !title}
        className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 rounded-xl"
      >
        {submitting ? 'Creating...' : 'Start Discussion'}
      </button>
    </div>
  );
}