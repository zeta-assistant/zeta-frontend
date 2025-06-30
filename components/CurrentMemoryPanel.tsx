'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export default function CurrentMemoryPanel() {
  const [memory, setMemory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchMemory = async () => {
      const { data, error } = await supabase
        .from('zeta_current_memory')
        .select('summary')
        .single();

      if (error) {
        console.error('Error fetching memory:', error);
        setMemory(null);
      } else {
        setMemory(data?.summary);
      }

      setLoading(false);
    };

    fetchMemory();
  }, []);

  return (
    <div className="w-full max-w-2xl mt-4 px-4">
      <div className="bg-yellow-300/60 border border-yellow-400 rounded-xl p-5 shadow-sm">
        <div className="flex items-center mb-2">
          <span className="text-xl">🧠</span>
          <h2 className="text-lg font-semibold text-gray-800 ml-2">
            Current Weekly Memory
          </h2>
        </div>

        {loading ? (
          <p className="text-gray-600 italic">Loading memory...</p>
        ) : memory ? (
          <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
            {memory}
          </p>
        ) : (
          <p className="text-gray-500 italic">No weekly memory found.</p>
        )}
      </div>
    </div>
  );
}