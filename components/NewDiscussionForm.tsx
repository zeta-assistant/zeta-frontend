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
    (async () => {
      const { data } = await supabase
        .from('documents')
        .select('id, file_name')
        .eq('project_id', projectId);
      setAvailableFiles(data || []);
    })();
  }, [projectId]);

  const handleCreate = async () => {
    if (!title) return;
    setSubmitting(true);

    const { data, error } = await supabase
      .from('discussions')
      .insert({
        project_id: projectId,
        title,
        file_ids: selectedFileId ? [selectedFileId] : null,
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Error creating discussion:', error.message);
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    onCreate(data);
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