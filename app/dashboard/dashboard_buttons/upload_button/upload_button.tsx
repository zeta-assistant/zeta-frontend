'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { FaUpload, FaFileAlt } from 'react-icons/fa';

type PF = { file_name: string; file_url: string; created_at: string | null };

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
  const [recent, setRecent] = useState<PF[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const publicUrlForPath = (path: string) =>
    supabase.storage.from('project-docs').getPublicUrl(path).data.publicUrl;

  async function fetchRecent() {
  try {
    const res = await fetch(`/api/project-files?project_id=${projectId}&limit=5`);
    const { rows } = await res.json();
    setRecent(
      (rows as PF[]).map(r => ({
        file_name: r.file_name,
        file_url: r.file_url,
        created_at: r.created_at ?? null,
      }))
    );
  } catch (e) {
    console.warn('fetchRecent error:', (e as any)?.message || e);
    setRecent([]);
  }
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
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('project_id', projectId);

      const res = await fetch('/api/documentupload', { method: 'POST', body: form });

      let payload: any;
      try {
        payload = await res.json();
      } catch {
        payload = { error: await res.text() };
      }

      if (!res.ok || payload?.error) {
        throw new Error(payload?.error || `HTTP ${res.status}`);
      }

      await fetchRecent();
      setFile(null);
      onUploaded?.(); // let parent refresh its own list if needed
    } catch (e: any) {
      alert(`Upload failed: ${e?.message || e}`);
    } finally {
      setUploading(false);
    }
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
        <div className="fixed inset-0 z-[2147483647]">
          <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
                        w-[min(720px,92vw)] max-h-[85vh] rounded-2xl border border-cyan-500/40
                        bg-cyan-950/90 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-cyan-600/40 bg-cyan-950/90 sticky top-0">
              <h2 className="text-cyan-50 font-medium truncate pr-3 flex items-center gap-2">
                <FaUpload className="text-purple-400" /> Upload a Document
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
              >
                Close
              </button>
            </div>

            <div className="p-5 overflow-auto max-h-[calc(85vh-52px)] pr-2">
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

              

              <div className="mt-4 flex justify-end">
                <button
                  onClick={fetchRecent}
                  className="text-xs px-2 py-1 rounded-md border border-cyan-600/60 bg-cyan-800/60 hover:bg-cyan-700/60"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
