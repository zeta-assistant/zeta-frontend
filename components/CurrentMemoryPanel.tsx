'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Props = {
  userEmail: string | null;
  projectId: string;
};

export default function CurrentMemoryPanel({ userEmail, projectId }: Props) {
  const [memory, setMemory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'daily' | 'weekly' | 'monthly'>('weekly');

  // Build the current week: Sunday to Saturday
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 6 = Saturday
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - dayOfWeek);

  const weekDates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return d;
  });

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
  });

  useEffect(() => {
    const fetchMemory = async () => {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        console.error('❌ Auth error:', authError);
        setMemory(null);
        setLoading(false);
        return;
      }

      let query;

      if (tab === 'daily') {
        const formattedDate = selectedDate.toISOString().split('T')[0];

        query = supabase
          .from('zeta_daily_memory')
          .select('memory')
          .eq('user_id', user.id)
          .eq('project_id', projectId)
          .eq('date', formattedDate)
          .maybeSingle();
      } else if (tab === 'weekly') {
        query = supabase
          .from('zeta_weekly_memory')
          .select('memory')
          .eq('user_id', user.id)
          .eq('project_id', projectId)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();
      } else {
        let fromDate = new Date();
        fromDate.setDate(fromDate.getDate() - 29);
        const fromISO = fromDate.toISOString().split('T')[0];

        query = supabase
          .from('zeta_current_memory')
          .select('summary')
          .eq('user_id', user.id)
          .eq('project_id', projectId)
          .gte('created_at', fromISO)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
      }

      const { data, error } = await query;

      if (error) {
        console.error('❌ Supabase fetch error:', JSON.stringify(error, null, 2));
        setMemory(null);
      } else {
        const raw =
          tab === 'daily' || tab === 'weekly'
            ? (data as { memory: string })?.memory
            : (data as { summary: string })?.summary;

        setMemory(raw ?? null);
      }

      setLoading(false);
    };

    fetchMemory();
  }, [projectId, tab, selectedDate]);

  const userInitials = userEmail?.slice(0, 2).toUpperCase() ?? '??';

  return (
    <div className="w-full bg-indigo-100 text-indigo-900 p-4 rounded-xl shadow border border-indigo-300 text-sm">
      <h2 className="text-lg font-bold mb-2">🧠 Memory</h2>

      <div className="flex gap-2 mb-3">
        {['daily', 'weekly', 'monthly'].map((t) => (
          <button
            key={t}
            className={`px-3 py-1 rounded text-sm font-semibold capitalize ${
              tab === t ? 'bg-white shadow' : 'bg-indigo-200'
            }`}
            onClick={() => setTab(t as typeof tab)}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'daily' && (
        <div className="mb-4">
          <div className="grid grid-cols-7 text-xs text-center font-bold mb-1">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
              <div key={`weekday-${i}`}>{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1 text-center">
            {weekDates.map((date, i) => {
              const isSelected =
                selectedDate.toDateString() === date.toDateString();

              return (
                <button
                  key={i}
                  onClick={() => setSelectedDate(date)}
                  className={`rounded-full py-1 text-xs transition-all duration-200 ${
                    isSelected
                      ? 'bg-white text-indigo-900 font-bold border border-indigo-500'
                      : 'bg-indigo-300 text-white hover:bg-indigo-400'
                  }`}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {loading ? (
        <p className="italic text-indigo-800 mb-4">Loading memory...</p>
      ) : memory ? (
        <p className="mb-4 leading-relaxed whitespace-pre-wrap">{memory}</p>
      ) : (
        <p className="italic mb-4">No memory found for this tab.</p>
      )}

      <div className="flex justify-between items-center mb-3 mt-2">
        <h2 className="font-bold text-base flex items-center gap-2">
          🔔 Notifications
        </h2>
        <div className="flex items-center gap-2">
          <button className="text-xs hover:underline text-indigo-700">Settings</button>
          <span className="bg-red-500 text-white text-xs rounded-full px-2 py-0.5">(2)</span>
        </div>
      </div>

      <div className="flex items-start gap-3 mt-2">
        <img
          src="/zeta-avatar.jpg"
          alt="Zeta avatar"
          className="w-8 h-8 rounded-full object-cover"
        />
        <div className="bg-white text-indigo-900 rounded-xl px-4 py-2 shadow text-xs max-w-[80%]">
          <p className="font-medium mb-1">Zeta:</p>
          <p className="leading-snug">Hey there! Got any new data for me to process?</p>
        </div>
      </div>

      <div className="flex items-start gap-3 mt-4">
        <div className="w-8 h-8 rounded-full bg-indigo-200 text-indigo-800 font-bold text-xs flex items-center justify-center border">
          {userInitials}
        </div>
        <input
          type="text"
          placeholder="Reply to Zeta..."
          className="bg-white text-indigo-900 text-xs px-4 py-2 rounded-xl shadow w-full focus:outline-none"
        />
      </div>
    </div>
  );
}