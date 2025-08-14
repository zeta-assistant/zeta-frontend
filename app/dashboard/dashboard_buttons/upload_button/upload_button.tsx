'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { FaUpload, FaFileAlt } from 'react-icons/fa';

type DocRow = { id: string; file_name: string; file_url: string | null; created_at: string };

export default function UploadButton({
  projectId,
  onUploaded,
  className = '',
}: {
  projectId: string;
  onUploaded?: () => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recent, setRecent] = useState<DocRow[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  async function fetchRecent() {
    const { data } = await supabase
      .from('documents')
      .select('id,file_name,file_url,created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(5);
    setRecent(data || []);
  }

  useEffect(() => {
    if (open) fetchRecent();
    if (!open) {
      setFile(null);
      setUploading(false);
    }
  }, [open]);

  async function handleUpload() {
    if (!file) return;
    setUploading(true);

    const form = new FormData();
    form.append('file', file);
    form.append('project_id', projectId);

    const res = await fetch('/api/documentupload', { method: 'POST', body: form });
    const json = await res.json();

    if (!res.ok) {
      console.error('❌ Upload failed:', json?.error || 'unknown');
      alert(`Upload failed: ${json?.error || 'Unknown error'}`);
      setUploading(false);
      return;
    }

    await fetchRecent();
    setFile(null);
    setUploading(false);
    onUploaded?.();
  }

  return (
    <>
      {/* small round button */}
      <button
        onClick={() => setOpen(true)}
        className={`w-11 h-11 text-xl flex items-center justify-center rounded-full border border-yellow-300 bg-white text-indigo-900 hover:bg-yellow-100 shadow-lg transition ${className}`}
        title="Upload documents"
      >
        📁
      </button>

      {!open ? null : (
        <div className="fixed inset-0 z-[100]">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                          w-[720px] max-w-[95vw] bg-blue-900 text-white border border-blue-700
                          rounded-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-semibold flex items-center gap-2">
                <FaUpload className="text-purple-400" /> Upload a Document
              </h2>
              <button onClick={() => setOpen(false)} className="text-blue-200 hover:text-white px-2 py-1 rounded">✕</button>
            </div>

            <div className="border-2 border-dashed border-purple-400 rounded-xl p-6 text-center mb-4">
              <input
                ref={fileInputRef}
                id="doc-upload-input"
                type="file"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              <label htmlFor="doc-upload-input" className="cursor-pointer text-purple-200">
                {file ? file.name : 'Drag & drop or click to select a file'}
              </label>
            </div>

            <Button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-lg py-2 rounded-xl shadow hover:opacity-90 transition"
            >
              {uploading ? 'Uploading…' : 'Upload'}
            </Button>

            <div className="mt-6">
              <h3 className="text-lg font-semibold mb-3">🧠 Zeta’s Memory (Last 5 Files)</h3>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, i) => {
                  const row = recent[i];
                  return (
                    <div key={i} className="bg-white text-purple-700 text-sm rounded-xl shadow p-4 flex flex-col items-center justify-center h-24">
                      {row ? (
                        <>
                          <FaFileAlt className="text-2xl mb-2" />
                          {row.file_url ? (
                            <a href={row.file_url} target="_blank" rel="noreferrer" className="text-xs text-center truncate w-full hover:underline" title={row.file_name}>
                              {row.file_name}
                            </a>
                          ) : (
                            <span className="text-xs text-center truncate w-full" title={row.file_name}>{row.file_name}</span>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-400">Empty</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}