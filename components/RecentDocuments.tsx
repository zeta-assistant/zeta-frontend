'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useParams } from 'next/navigation';
import Link from 'next/link';

type Document = {
  file_name: string;
  file_url: string;
};

const iconMap: { [ext: string]: string } = {
  pdf: '📄',
  docx: '📝',
  xlsx: '📊',
  csv: '📈',
  png: '🖼️',
  jpg: '📷',
  jpeg: '📷',
  txt: '📃',
};

export default function RecentDocuments() {
  const [docs, setDocs] = useState<Document[]>([]);
  const params = useParams();
  const projectId = params.projectId as string;

  useEffect(() => {
    const fetchDocs = async () => {
      const { data, error } = await supabase
        .from('documents')
        .select('file_name, file_url')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Error fetching documents:', error.message);
      } else {
        setDocs(data || []);
      }
    };

    fetchDocs();
  }, [projectId]);

  return (
    <div className="flex justify-center gap-2 mt-4">
      {docs.map((doc, i) => {
        const ext = doc.file_name.split('.').pop()?.toLowerCase();
        const icon = iconMap[ext ?? ''] || '📁';
        const fileUrl = `https://inprydzukperccgtxgvx.supabase.co/storage/v1/object/public/project-docs/${doc.file_url}`;

        return (
          <Link key={i} href={fileUrl} target="_blank" rel="noopener noreferrer">
            <span className="text-4xl hover:scale-110 transition-transform cursor-pointer">
              {icon}
            </span>
          </Link>
        );
      })}
    </div>
  );
}