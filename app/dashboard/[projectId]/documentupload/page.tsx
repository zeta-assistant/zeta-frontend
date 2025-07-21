'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { FaUpload, FaFileAlt } from 'react-icons/fa';

export default function DocumentUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [recentFiles, setRecentFiles] = useState<{ file_name: string }[]>([]);
  const params = useParams();
  const projectId = params.projectId as string;

  const handleUpload = async () => {
    if (!file || !projectId) return;
    setUploading(true);

    const fileName = `${Date.now()}-${file.name}`;
    const filePath = `${projectId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('project-docs')
      .upload(filePath, file);

    if (uploadError) {
      console.error('❌ Upload failed:', uploadError.message);
      setUploading(false);
      return;
    }

    const { error: insertError } = await supabase.from('documents').insert({
      project_id: projectId,
      file_name: file.name,
      file_url: filePath,
    });

    if (insertError) {
      console.error('❌ Failed to insert document metadata:', insertError.message);
    }

    await fetchRecentFiles(); // refresh after upload

    setUploading(false);
    setFile(null);
  };

  const fetchRecentFiles = async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('file_name')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) {
      console.error('❌ Failed to load recent files:', error.message);
    } else {
      setRecentFiles(data || []);
    }
  };

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
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="bg-white text-purple-700 text-sm rounded-xl shadow p-4 flex flex-col items-center justify-center h-24"
              >
                {recentFiles[i] ? (
                  <>
                    <FaFileAlt className="text-2xl mb-2" />
                    <span className="text-xs text-center truncate w-full">{recentFiles[i].file_name}</span>
                  </>
                ) : (
                  <span className="text-gray-400">Empty</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
