'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { FaUpload, FaFileAlt } from 'react-icons/fa';

type PF = { id: string; file_name: string; file_url: string; uploaded_at: string };

export default function DocumentUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recentFiles, setRecentFiles] = useState<PF[]>([]);
  const params = useParams();
  const projectId = params.projectId as string;

  async function handleUpload() {
    if (!file || !projectId) return;
    setUploading(true);

    try {
      const fd = new FormData();
      fd.set('file', file);
      fd.set('project_id', projectId);

      const res = await fetch('/api/documentupload', { method: 'POST', body: fd });
      const data = await res.json();

      if (!res.ok) {
        console.error('upload failed:', data?.error || data);
        alert(data?.error || 'Upload failed');
      } else {
        // recent files + LogsPanel realtime will both update
        await fetchRecentFiles();
        setFile(null);
      }
    } catch (e) {
      console.error(e);
      alert('Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function fetchRecentFiles() {
    try {
      // read from project_files via your own API (no RLS issues on client)
      const res = await fetch(`/api/project-files?project_id=${projectId}`);
      if (!res.ok) throw new Error('fetch project_files failed');
      const payload = (await res.json()) as { rows: PF[] };
      setRecentFiles(payload.rows || []);
    } catch (e) {
      // optional: fall back to direct client query if your RLS allows it
      console.warn('fallback to direct client fetch not implemented', e);
      setRecentFiles([]);
    }
  }

  useEffect(() => {
    if (projectId) fetchRecentFiles();
  }, [projectId]);

  return (
    <div className="min-h-screen bg-blue-950 text-white px-6 py-12 flex flex-col items-center">
      <div className="w-full max-w-3xl bg-blue-900 rounded-2xl p-10 shadow-lg">
        <h1 className="text-3xl font-bold text-center mb-6 flex items-center justify-center gap-3">
          <FaUpload className="text-purple-400" />
          Upload a Document
        </h1>

        <div className="border-2 border-dashed border-purple-400 rounded-xl p-6 mb-6 text-center">
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="hidden"
            id="file-upload"
          />
          <label htmlFor="file-upload" className="cursor-pointer text-purple-200">
            {file ? file.name : 'Drag or click to select a file'}
          </label>
        </div>

        <Button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="w-full bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold text-lg py-2 rounded-xl shadow hover:opacity-90 transition"
        >
          {uploading ? 'Uploading...' : 'Upload'}
        </Button>

        <div className="mt-12">
          <h2 className="text-xl font-semibold mb-4">🧠 Zeta’s Memory (Last 5 Files)</h2>
          <div className="grid grid-cols-5 gap-4">
            {Array.from({ length: 5 }).map((_, i) => {
              const f = recentFiles[i];
              return (
                <div
                  key={i}
                  className="bg-white text-purple-700 text-sm rounded-xl shadow p-4 flex flex-col items-center justify-center h-24"
                >
                  {f ? (
                    <>
                      <FaFileAlt className="text-2xl mb-2" />
                      <a
                        href={f.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-center truncate w-full underline"
                        title={f.file_name}
                      >
                        {f.file_name}
                      </a>
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
  );
}