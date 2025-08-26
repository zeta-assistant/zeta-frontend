'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function VerifyPage() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<'verifying' | 'success' | 'error'>('verifying');

  useEffect(() => {
    const verify = async () => {
      const id = searchParams.get('id');
      const projectId = searchParams.get('projectId');

      if (!id || !projectId) {
        setStatus('error');
        return;
      }

      const { error } = await supabase
        .from('project_integrations')
        .update({ is_verified: true })
        .eq('id', id)
        .eq('project_id', projectId);

      if (error) {
        console.error('Verification error:', error);
        setStatus('error');
      } else {
        setStatus('success');
      }
    };

    verify();
  }, [searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 px-6">
      <div className="max-w-md p-6 rounded-lg shadow-lg bg-white dark:bg-slate-800 text-center">
        {status === 'verifying' && (
          <p className="text-lg text-gray-700 dark:text-gray-200">🔄 Verifying your email...</p>
        )}
        {status === 'success' && (
          <p className="text-lg text-green-600 dark:text-green-400">✅ Email verified successfully!</p>
        )}
        {status === 'error' && (
          <p className="text-lg text-red-600 dark:text-red-400">❌ Verification failed. Try again.</p>
        )}
      </div>
    </div>
  );
}