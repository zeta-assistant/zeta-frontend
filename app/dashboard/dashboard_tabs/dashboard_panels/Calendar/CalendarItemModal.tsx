'use client';

import React, { useState, useEffect } from 'react';

type CalendarItem = {
  id?: string;
  type: string;
  title: string;
  date: string;
};

export default function CalendarItemModal({
  isOpen,
  onClose,
  onSubmit,
  selectedType,
  defaultDate,
  editItem,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (item: CalendarItem) => void;
  selectedType: string;
  defaultDate?: string | null;
  editItem?: CalendarItem | null;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [type, setType] = useState(selectedType);

  useEffect(() => {
    if (editItem) {
      setTitle(editItem.title);
      setDate(editItem.date);
      setType(editItem.type);
    } else {
      setTitle('');
      setDate(defaultDate || '');
      setType(selectedType);
    }
  }, [editItem, defaultDate, selectedType]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-blue-950 border border-purple-500 text-white rounded-xl p-6 w-80 space-y-4">
        <h3 className="text-lg font-semibold text-purple-200">
          {editItem ? 'Edit Item' : `Create New ${type}`}
        </h3>

        <div className="space-y-2">
          <label className="text-sm block">Title</label>
          <input
            className="w-full p-2 rounded bg-blue-900 border border-purple-600"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="What is this about?"
          />

          <label className="text-sm block mt-3">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="w-full p-2 rounded bg-blue-900 border border-purple-600"
          >
            <option value="task">Task</option>
            <option value="event">Event</option>
            <option value="reminder">Reminder</option>
            <option value="notification">Notification</option>
            <option value="note">Note</option>
          </select>

          <label className="text-sm block mt-3">Date</label>
          <input
            type="date"
            className="w-full p-2 rounded bg-blue-900 border border-purple-600"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="flex justify-between pt-4">
          <button onClick={onClose} className="text-sm text-purple-400 hover:underline">
            Cancel
          </button>
          <button
            className="bg-purple-700 px-4 py-2 rounded text-white hover:bg-purple-600 text-sm"
            onClick={() => {
              if (title && date) {
                onSubmit({
                  ...(editItem?.id ? { id: editItem.id } : {}),
                  type,
                  title,
                  date,
                });
              }
            }}
          >
            {editItem ? 'Update' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}