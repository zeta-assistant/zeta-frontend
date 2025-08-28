'use client';

import React, { useEffect, useState } from 'react';

type CalendarItem = {
  id?: string;
  type: string;
  title: string;
  details?: string | null;
  date: string;            // YYYY-MM-DD
  time?: string | null;    // 'HH:mm'
  length?: number | null;  // minutes
};

export default function CalendarItemModal({
  isOpen,
  onClose,
  onSubmit,
  selectedType,
  defaultDate,
  editItem,
  hasTime,
  hasLength,
  hasDetails,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (item: CalendarItem) => void;
  selectedType: string;
  defaultDate?: string | null;
  editItem?: CalendarItem;
  hasTime?: boolean;
  hasLength?: boolean;
  hasDetails?: boolean;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState(selectedType || 'task');
  const [date, setDate] = useState('');
  const [time, setTime] = useState<string>('');
  const [length, setLength] = useState<number | ''>('');
  const [details, setDetails] = useState<string>('');

  useEffect(() => {
    if (editItem) {
      setTitle(editItem.title || '');
      setType(editItem.type || 'task');
      setDate(editItem.date || '');
      setTime(editItem.time || '');
      setLength(editItem.length ?? '');
      setDetails(editItem.details || '');
    } else {
      setTitle('');
      setType(selectedType || 'task');
      setDate(defaultDate || '');
      setTime('');
      setLength('');
      setDetails('');
    }
  }, [editItem, defaultDate, selectedType]);

  if (!isOpen) return null;

  const save = () => {
    if (!title || !date) return;
    onSubmit({
      ...(editItem?.id ? { id: editItem.id } : {}),
      type,
      title,
      date,
      ...(hasDetails ? { details: details || null } : {}),
      ...(hasTime ? { time: time || null } : {}),
      ...(hasLength ? { length: length === '' ? null : Number(length) } : {}),
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[400px] rounded-xl border border-purple-600 bg-blue-950 p-6 text-white shadow-lg">
        <h3 className="mb-3 text-lg font-semibold text-purple-200">
          {editItem ? 'Edit Calendar Item' : 'Create Calendar Item'}
        </h3>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm">Title</label>
            <input
              className="w-full rounded border border-purple-600 bg-blue-900 p-2"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What is this about?"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm">Type</label>
            <select
              className="w-full rounded border border-purple-600 bg-blue-900 p-2"
              value={type}
              onChange={(e) => setType(e.target.value)}
            >
              <option value="task">Task</option>
              <option value="event">Event</option>
              <option value="reminder">Reminder</option>
              <option value="notification">Notification</option>
              <option value="note">Note</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm">Date</label>
            <input
              type="date"
              className="w-full rounded border border-purple-600 bg-blue-900 p-2"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>

          {hasTime ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-sm">
                  Time <span className="text-xs text-purple-300">(optional)</span>
                </label>
                <input
                  type="time"
                  className="w-full rounded border border-purple-600 bg-blue-900 p-2"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
              {hasLength ? (
                <div>
                  <label className="mb-1 block text-sm">
                    Length (minutes) <span className="text-xs text-purple-300">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className="w-full rounded border border-purple-600 bg-blue-900 p-2"
                    value={length}
                    onChange={(e) => setLength(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {hasDetails ? (
            <div>
              <label className="mb-1 block text-sm">
                Details <span className="text-xs text-purple-300">(optional)</span>
              </label>
              <textarea
                className="w-full rounded border border-purple-600 bg-blue-900 p-2"
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                placeholder="Notes, location, etc."
              />
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex justify-between">
          <button className="text-sm text-purple-400 hover:underline" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded bg-purple-700 px-4 py-2 text-sm hover:bg-purple-600" onClick={save}>
            {editItem ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
