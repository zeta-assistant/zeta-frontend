'use client';

import React, { useState, useEffect } from 'react';
import CalendarItemModal from './CalendarItemModal';
import { supabase } from '@/lib/supabaseClient';
import { useParams } from 'next/navigation';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

const EMOJI_MAP: Record<string, string> = {
  event: '🔵',
  reminder: '🔴',
  notification: '🟠',
  task: '🟢',
  note: '🟡',
};

const TYPE_COLOR_MAP: Record<string, string> = {
  event: 'bg-blue-600',
  reminder: 'bg-red-600',
  notification: 'bg-orange-500',
  task: 'bg-green-600',
  note: 'bg-yellow-600',
};


export default function CalendarPanel({ fontSize }: { fontSize: 'sm' | 'base' | 'lg' }) {
  const { projectId } = useParams();
  const [calendarItems, setCalendarItems] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  const [selectedType, setSelectedType] = useState('Task');
  const [viewMoreToday, setViewMoreToday] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);



  const todayStr = dayjs().format('YYYY-MM-DD');
  const currentMonthString = currentMonth.format('YYYY-MM');
  const daysInMonth = currentMonth.daysInMonth();
  const firstDayIndex = currentMonth.startOf('month').day();

  useEffect(() => {
    const fetchItems = async () => {
      const { data, error } = await supabase
        .from('calendar_items')
        .select('*')
        .eq('project_id', projectId)
        .order('date', { ascending: true });

      if (!error && data) setCalendarItems(data);
    };

    if (projectId) {
  (async () => {
    const { data: mainframeData, error: mainframeError } = await supabase
      .from('mainframe_info')
      .select('current_date')
      .eq('project_id', projectId)
      .single();

    if (mainframeData?.current_date) {
      setCurrentMonth(dayjs(mainframeData.current_date).startOf('month'));
    } else {
      setCurrentMonth(dayjs().startOf('month'));
    }

    fetchItems();
  })();
}
  }, [projectId]);

  const handleCreateOrEditItem = async (item: { type: string; title: string; date: string }) => {
    if (editItem) {
      const { error } = await supabase
        .from('calendar_items')
        .update({
          title: item.title,
          type: item.type.toLowerCase(),
          date: item.date,
        })
        .eq('id', editItem.id);

      if (!error) {
        setCalendarItems((prev) =>
          prev.map((i) => (i.id === editItem.id ? { ...i, ...item } : i))
        );
      }
    } else {
      const { data, error } = await supabase
        .from('calendar_items')
        .insert([
          {
            project_id: projectId,
            type: item.type.toLowerCase(),
            title: item.title,
            date: item.date,
          },
        ])
        .select();

      if (!error && data) setCalendarItems((prev) => [...prev, ...data]);
    }

    setModalOpen(false);
    setSelectedDate(null);
    setEditItem(null);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('calendar_items').delete().eq('id', id);
    if (!error) setCalendarItems((prev) => prev.filter((item) => item.id !== id));
  };

  const displayedItems = calendarItems.filter((item) =>
    item.date.startsWith(currentMonthString)
  );

  const todaysTasks = calendarItems.filter((i) => i.date === todayStr);
 const upcomingItems = calendarItems
  .filter((item) => {
    const itemDate = dayjs(item.date).startOf('day');
    const today = dayjs().startOf('day');
    return itemDate.isAfter(today);
  })
  .sort((a, b) => dayjs(a.date).diff(dayjs(b.date)))
  .slice(0, 3);

  return (
    <div className={`p-6 overflow-y-auto text-${fontSize} text-white space-y-6`}>
      <h2 className="text-lg font-semibold">📅 Monthly Planner</h2>

      {/* Calendar */}
      <div className="bg-blue-950 border border-purple-500 rounded-xl p-4 shadow-md">
        <div className="flex justify-between items-center mb-3 text-purple-200">
          <button onClick={() => setCurrentMonth(currentMonth.subtract(1, 'month'))}>
            &lt;
          </button>
          <span className="font-semibold">{currentMonth.format('MMMM YYYY')}</span>
          <button onClick={() => setCurrentMonth(currentMonth.add(1, 'month'))}>
            &gt;
          </button>
        </div>

        <div className="grid grid-cols-7 text-xs text-center text-purple-300 mb-1">
          <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
        </div>

        <div className="grid grid-cols-7 gap-1 text-sm">
          {Array.from({ length: firstDayIndex }).map((_, idx) => <div key={idx} />)}

          {Array.from({ length: daysInMonth }).map((_, dayIdx) => {
            const day = dayIdx + 1;
            const dateStr = currentMonth.format(`YYYY-MM-${String(day).padStart(2, '0')}`);
            const matches = displayedItems.filter((item) => item.date === dateStr);
            const emojis = matches.map((m) => EMOJI_MAP[m.type] || '').join(' ');

            return (
              <div
                key={day}
                onClick={() => {
                  setSelectedDate(dateStr);
                  setSelectedType('Task');
                  setModalOpen(true);
                }}
                className="relative rounded-md border border-purple-900 text-purple-200 h-12 flex items-center justify-center cursor-pointer hover:bg-purple-600/20"
              >
                <div className="text-center w-full">
                  {day}
                  {emojis && (
                    <div className="absolute bottom-1 text-xs w-full text-center">{emojis}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-4 text-xs text-purple-300 bg-purple-900/30 p-2 rounded-md">
          <span className="mr-3">🔵 Event</span>
          <span className="mr-3">🔴 Reminder</span>
          <span className="mr-3">🟠 Notification</span>
          <span className="mr-3">🟢 Task</span>
          <span>🟡 Note</span>
        </div>
      </div>

      {/* 🧭 Today’s Tasks & Upcoming Side-by-Side */}
<div className="flex gap-6 w-full">
  {/* 📅 Today’s Tasks */}
  <div className="flex-1 bg-purple-900/30 p-4 rounded-xl border border-purple-600">
    <h3 className="font-semibold text-purple-200 mb-2">🗓 Today’s Tasks</h3>
    {todaysTasks.length === 0 ? (
      <p className="text-gray-400 text-sm">No tasks today.</p>
    ) : (
      <ul className="space-y-2 text-sm">
        {(viewMoreToday ? todaysTasks : todaysTasks.slice(0, 3)).map((item) => (
          <li key={item.id} className={`flex justify-between items-center px-3 py-2 rounded-lg text-white ${TYPE_COLOR_MAP[item.type] || 'bg-blue-800'}`}>
            <div className="flex flex-col">
              <span>{item.title}</span>
              <span className="text-xs opacity-80">{item.date}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setEditItem(item);
                  setModalOpen(true);
                }}
                className="text-xs bg-yellow-600 hover:bg-yellow-500 px-2 py-1 rounded"
              >
                ✏️
              </button>
              <button
                onClick={() => handleDelete(item.id)}
                className="text-xs bg-red-700 hover:bg-red-600 px-2 py-1 rounded"
              >
                🗑
              </button>
            </div>
          </li>
        ))}
      </ul>
    )}
    {todaysTasks.length > 3 && (
      <button
        onClick={() => setViewMoreToday(!viewMoreToday)}
        className="text-purple-300 text-sm hover:underline mt-2"
      >
        {viewMoreToday ? 'Show Less' : 'See More'}
      </button>
    )}
  </div>

  {/* 🔜 Upcoming */}
<div className="flex-1 bg-purple-900/30 p-4 rounded-xl border border-purple-600">
  <h3 className="font-semibold text-purple-200 mb-2">🔜 Upcoming</h3>
  {upcomingItems.length === 0 ? (
    <p className="text-gray-400 text-sm">No upcoming entries.</p>
  ) : (
    <ul className="space-y-2 text-sm">
      {upcomingItems.map((item) => (
        <li
          key={item.id}
          className={`flex justify-between items-center px-3 py-2 rounded-lg text-white ${
            TYPE_COLOR_MAP[item.type] || 'bg-blue-800'
          }`}
        >
          <div className="flex flex-col">
            <span>{item.title}</span>
            <span className="text-xs opacity-80">{item.date}</span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setEditItem(item);
                setModalOpen(true);
              }}
              className="text-xs bg-yellow-600 hover:bg-yellow-500 px-2 py-1 rounded"
            >
              ✏️
            </button>
            <button
              onClick={() => handleDelete(item.id)}
              className="text-xs bg-red-700 hover:bg-red-600 px-2 py-1 rounded"
            >
              🗑
            </button>
          </div>
        </li>
      ))}
    </ul>
  )}
</div>
</div>

      {/* Modal */}
      <CalendarItemModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setSelectedDate(null);
          setEditItem(null);
        }}
        onSubmit={handleCreateOrEditItem}
        selectedType={editItem?.type || selectedType}
        defaultDate={selectedDate || editItem?.date || undefined}
      />
    </div>
  );
}