'use client';

import React, { useEffect, useMemo, useState } from 'react';
import CalendarItemModal from './CalendarItemModal';
import { supabase } from '@/lib/supabaseClient';
import { useParams } from 'next/navigation';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

type Item = {
  id: string;
  project_id: string;
  type: 'event' | 'reminder' | 'notification' | 'task' | 'note' | string;
  title: string;
  details?: string | null;
  date: string;
  time?: string | null;    // 'HH:mm'
  length?: number | null;  // minutes
};

const TYPE_COLOR_MAP: Record<string, string> = {
  event: 'bg-sky-500',
  reminder: 'bg-rose-500',
  notification: 'bg-amber-500',
  task: 'bg-emerald-500',
  note: 'bg-yellow-400',
};

function Dot({ type }: { type: string }) {
  return <span className={['inline-block w-2 h-2 rounded-full', TYPE_COLOR_MAP[type] || 'bg-sky-500'].join(' ')} />;
}

function fmtTime(t?: string | null) {
  return t ? t : '';
}

export default function CalendarPanel({ fontSize }: { fontSize: 'sm' | 'base' | 'lg' }) {
  const { projectId } = useParams() as { projectId: string };

  const [items, setItems] = useState<Item[]>([]);
  const [currentMonth, setCurrentMonth] = useState(dayjs().startOf('month'));
  const [selectedDate, setSelectedDate] = useState<string>(dayjs().format('YYYY-MM-DD'));

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<Item | null>(null);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      const { data: mf } = await supabase
        .from('mainframe_info')
        .select('current_date')
        .eq('project_id', projectId)
        .single();

      if (mf?.current_date) {
        setCurrentMonth(dayjs(mf.current_date).startOf('month'));
        setSelectedDate(dayjs(mf.current_date).format('YYYY-MM-DD'));
      }

      const { data } = await supabase
        .from('calendar_items')
        .select('*')
        .eq('project_id', projectId)
        .order('date', { ascending: true });

      if (data) setItems(data as any);
    })();
  }, [projectId]);

  const currentMonthString = currentMonth.format('YYYY-MM');
  const daysInMonth = currentMonth.daysInMonth();
  const firstDayIndex = currentMonth.startOf('month').day();

  const monthItems = useMemo(
    () => items.filter((it) => it.date.startsWith(currentMonthString)),
    [items, currentMonthString]
  );

  const selectedDayItems = useMemo(
    () =>
      items
        .filter((it) => it.date === selectedDate)
        .sort((a, b) => (a.time || '24:00').localeCompare(b.time || '24:00')),
    [items, selectedDate]
  );

  const timed = selectedDayItems.filter((i) => !!i.time);

  const hasTime = items.some((i) => 'time' in i);
  const hasLength = items.some((i) => 'length' in i);
  const hasDetails = items.some((i) => 'details' in i);

    const handleCreateOrEditItem = async (payload: {
    id?: string;
    type: string;
    title: string;
    details?: string | null;
    date: string;
    time?: string | null;
    length?: number | null;
    reminder_offset_minutes?: number | null;
    reminder_channels?: { email?: boolean; telegram?: boolean; inapp?: boolean } | null;
  }) => {
    const baseRow: any = {
      type: payload.type.toLowerCase(),
      title: payload.title,
      date: payload.date,
    };
    if (hasDetails) baseRow.details = payload.details ?? null;
    if (hasTime) baseRow.time = payload.time ?? null;
    if (hasLength) baseRow.length = payload.length ?? null;

    // NEW: reminder fields
    baseRow.reminder_offset_minutes =
      typeof payload.reminder_offset_minutes === 'number' ? payload.reminder_offset_minutes : 0;
    baseRow.reminder_channels = payload.reminder_channels ?? { telegram: true, email: false, inapp: true };

    if (payload.id) {
      const { error } = await supabase.from('calendar_items').update(baseRow).eq('id', payload.id);
      if (!error)
        setItems((prev) => prev.map((i) => (i.id === payload.id ? { ...i, ...baseRow } : i)));
    } else {
      const insertRow = { project_id: projectId, ...baseRow };
      const { data, error } = await supabase.from('calendar_items').insert([insertRow]).select();
      if (!error && data) {
        setItems((prev) => [...prev, ...(data as any)]);
        await supabase.from('system_logs').insert({
          project_id: projectId,
          actor: 'user',
          event: `calendar.${baseRow.type}`,
          details: {
            title: baseRow.title,
            when: baseRow.date,
            time: baseRow.time,
            length: baseRow.length,
            reminder_offset_minutes: baseRow.reminder_offset_minutes,
            reminder_channels: baseRow.reminder_channels,
          },
        });
      }
    }

    setModalOpen(false);
    setEditItem(null);
  };


  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('calendar_items').delete().eq('id', id);
    if (!error) setItems((prev) => prev.filter((i) => i.id !== id));
  };

  function MonthCell({ dateStr, dayNum }: { dateStr: string; dayNum: number }) {
    const matches = monthItems.filter((it) => it.date === dateStr);
    return (
      <button
        onClick={() => setSelectedDate(dateStr)}
        className={[
          'relative h-12 rounded-md border border-sky-300 bg-sky-50 hover:bg-sky-100',
          selectedDate === dateStr ? 'ring-2 ring-sky-400' : '',
        ].join(' ')}
      >
        <div className="absolute top-1 left-1 text-[11px] text-sky-900">{dayNum}</div>
        {matches.length > 0 && (
          <div className="absolute bottom-1 left-0 right-0 flex items-center justify-center gap-1">
            {matches.slice(0, 6).map((m) => <Dot key={m.id} type={m.type} />)}
            {matches.length > 6 && <span className="text-[10px] text-sky-700">+{matches.length - 6}</span>}
          </div>
        )}
      </button>
    );
  }

  return (
    // Extra bottom padding so the bottom border and scrollbar are never clipped
    <div className={`p-5 pb-16 text-${fontSize}`}>
      {/* Top controls */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <button className="px-3 py-1 rounded bg-sky-200 text-sky-900 hover:bg-sky-300"
            onClick={() => setCurrentMonth(currentMonth.subtract(1, 'month'))}>‹</button>
          <div className="text-base font-semibold px-3 py-1 rounded border border-sky-300 bg-sky-50 text-sky-900">
            {currentMonth.format('MMMM YYYY')}
          </div>
          <button className="px-3 py-1 rounded bg-sky-200 text-sky-900 hover:bg-sky-300"
            onClick={() => setCurrentMonth(currentMonth.add(1, 'month'))}>›</button>
          <button className="ml-2 px-3 py-1 rounded border border-sky-300 text-sky-900 bg-sky-50 hover:bg-sky-100"
            onClick={() => { setCurrentMonth(dayjs().startOf('month')); setSelectedDate(dayjs().format('YYYY-MM-DD')); }}>
            Today
          </button>
        </div>
        <div className="grow" />
        <button className="px-3 py-1 rounded bg-cyan-500 text-white hover:bg-cyan-400"
          onClick={() => { setEditItem(null); setModalOpen(true); }}>+ New</button>
      </div>

      {/* MONTH */}
      <section className="rounded-xl border border-sky-300 bg-sky-50 text-sky-900 p-3 shadow-sm mb-2">
        <div className="grid grid-cols-7 text-[11px] text-center text-sky-700 mb-1">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>
        <div className="grid grid-cols-7 gap-1">
          {Array.from({ length: firstDayIndex }).map((_, i) => <div key={`pad-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const d = i + 1;
            const dateStr = currentMonth.format(`YYYY-MM-${String(d).padStart(2, '0')}`);
            return <MonthCell key={d} dayNum={d} dateStr={dateStr} />;
          })}
        </div>
      </section>

      {/* DAY VIEW */}
      <section className="rounded-xl border border-sky-300 bg-sky-50 text-sky-900 p-3 shadow-sm">
        {/* Header + Legend */}
        <div className="mb-2 flex flex-wrap items-center gap-3">
          <div>
            <div className="text-xs text-sky-700">Selected Day</div>
            <div className="text-base font-semibold">{dayjs(selectedDate).format('dddd, MMM D')}</div>
          </div>
          <div className="flex items-center gap-2">
            <button className="px-2 py-1 rounded border border-sky-300 bg-sky-50 hover:bg-sky-100"
              onClick={() => setSelectedDate(dayjs(selectedDate).subtract(1, 'day').format('YYYY-MM-DD'))}>‹</button>
            <button className="px-2 py-1 rounded border border-sky-300 bg-sky-50 hover:bg-sky-100"
              onClick={() => setSelectedDate(dayjs(selectedDate).add(1, 'day').format('YYYY-MM-DD'))}>›</button>
            <button className="px-3 py-1 rounded bg-cyan-500 text-white hover:bg-cyan-400"
              onClick={() => { setEditItem(null); setModalOpen(true); }}>+ Add</button>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-sky-800">
            <span className="inline-flex items-center gap-1"><Dot type="event" />Event</span>
            <span className="inline-flex items-center gap-1"><Dot type="reminder" />Reminder</span>
            <span className="inline-flex items-center gap-1"><Dot type="notification" />Notification</span>
            <span className="inline-flex items-center gap-1"><Dot type="task" />Task</span>
            <span className="inline-flex items-center gap-1"><Dot type="note" />Note</span>
          </div>
        </div>

        {/* Symmetric columns with internal scroll; min-h-0 avoids clipping; equal fixed heights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-start min-h-0">
          {/* SCHEDULE */}
          <div className="min-h-0">
            <div className="text-[10px] uppercase tracking-wide text-sky-600 mb-1">Schedule</div>
            <div className="h-[200px] overflow-y-auto pr-2 pb-2 rounded border border-sky-300">

              {Array.from({ length: 24 }).map((_, hour) => {
                const label = `${String(hour).padStart(2, '0')}:00`;
                const hourItems = timed.filter(
                  (it) => (it.time || '').slice(0, 2) === String(hour).padStart(2, '0')
                );
                return (
                  <div key={hour} className="border-b border-sky-200">
                    <div className="grid grid-cols-[56px_1fr] gap-2 px-2 py-1.5 items-start">
                      <div className="text-[10px] text-sky-700 pt-0.5">{label}</div>
                      <div className="space-y-1.5">
                        {hourItems.length === 0 ? (
                          <div className="h-4" />
                        ) : (
                          hourItems.map((it) => (
                            <div key={it.id}
                              className="flex items-center justify-between rounded bg-white border border-sky-200 px-2 py-1.5">
                              <div className="flex items-center gap-2">
                                <Dot type={it.type} />
                                <div className="flex flex-col">
                                  <span className="text-[13px] font-medium leading-tight">{it.title}</span>
                                  <span className="text-[11px] text-sky-700">
                                    {fmtTime(it.time)}{it.length ? ` · ${it.length}m` : ''}
                                  </span>
                                  {hasDetails && it.details ? (
                                    <span className="text-[11px] text-sky-700">{it.details}</span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button className="text-[11px] px-2 py-0.5 rounded bg-cyan-500 text-white hover:bg-cyan-400"
                                  onClick={() => { setEditItem(it); setModalOpen(true); }}>✏️</button>
                                <button className="text-[11px] px-2 py-0.5 rounded bg-sky-200 text-sky-900 hover:bg-sky-300"
                                  onClick={() => handleDelete(it.id)}>🗑</button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ITEMS */}
          <div className="min-h-0">
            <div className="text-[10px] uppercase tracking-wide text-sky-600 mb-1">Items</div>
            <div className="h-[200px] overflow-y-auto pr-2 pb-2 rounded border border-sky-300 bg-white">
              {selectedDayItems.length === 0 ? (
                <div className="px-2 py-1.5 text-[12px] text-sky-700">No items for this day.</div>
              ) : (
                <ul className="space-y-1 px-2 py-1">
                  {selectedDayItems.map((it) => (
                    <li key={it.id} className="flex items-center justify-between rounded bg-sky-50 border border-sky-200 px-2 py-1.5">
                      <div className="flex items-center gap-2">
                        <Dot type={it.type} />
                        <div className="flex flex-col">
                          <span className="text-[13px] font-medium leading-tight">{it.title}</span>
                          <span className="text-[11px] text-sky-700">
                            {it.time ? `${fmtTime(it.time)}${it.length ? ` · ${it.length}m` : ''}` : 'All-day'}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button className="text-[11px] px-2 py-0.5 rounded bg-cyan-500 text-white hover:bg-cyan-400"
                          onClick={() => { setEditItem(it); setModalOpen(true); }}>✏️</button>
                        <button className="text-[11px] px-2 py-0.5 rounded bg-sky-200 text-sky-900 hover:bg-sky-300"
                          onClick={() => handleDelete(it.id)}>🗑</button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </section>

      

      {/* Modal */}
      <CalendarItemModal
        isOpen={modalOpen}
        onClose={() => { setModalOpen(false); setEditItem(null); }}
        onSubmit={handleCreateOrEditItem}
        selectedType={editItem?.type || 'task'}
        defaultDate={editItem?.date || selectedDate}
        editItem={editItem || undefined}
        hasTime={hasTime}
        hasLength={hasLength}
        hasDetails={hasDetails}
      />
    </div>
  );
}
