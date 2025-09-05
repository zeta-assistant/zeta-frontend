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
  reminder_offset_minutes?: number | null;
  reminder_channels?: { email?: boolean; telegram?: boolean; inapp?: boolean } | null;
};

const REMINDER_PRESETS = [
  { label: 'At time of event', value: 0 },
  { label: '5 minutes before', value: 5 },
  { label: '15 minutes before', value: 15 },
  { label: '30 minutes before', value: 30 },
  { label: '1 hour before', value: 60 },
  { label: '1 day before', value: 1440 },
  { label: 'Custom…', value: -1 },
];

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

  // reminders
  const [reminderSel, setReminderSel] = useState<number>(0); // one of presets or -1 (custom)
  const [customMinutes, setCustomMinutes] = useState<number | ''>('');
  const [reminderChannels, setReminderChannels] = useState<{ email: boolean; telegram: boolean; inapp: boolean }>({
    email: false,
    telegram: true,
    inapp: true,
  });

  useEffect(() => {
    if (editItem) {
      setTitle(editItem.title || '');
      setType(editItem.type || 'task');
      setDate(editItem.date || '');
      setTime(editItem.time || '');
      setLength(editItem.length ?? '');
      setDetails(editItem.details || '');

      const off = typeof editItem.reminder_offset_minutes === 'number' ? editItem.reminder_offset_minutes : null;
      if (off === null) {
        setReminderSel(0);
      } else if ([0, 5, 15, 30, 60, 1440].includes(off)) {
        setReminderSel(off);
      } else {
        setReminderSel(-1);
        setCustomMinutes(off);
      }

      const ch = editItem.reminder_channels || {};
      setReminderChannels({
        email: !!ch.email,
        telegram: ch.telegram !== false, // default true
        inapp: ch.inapp !== false,       // default true
      });
    } else {
      setTitle('');
      setType(selectedType || 'task');
      setDate(defaultDate || '');
      setTime('');
      setLength('');
      setDetails('');
      setReminderSel(0);
      setCustomMinutes('');
      setReminderChannels({ email: false, telegram: true, inapp: true });
    }
  }, [editItem, defaultDate, selectedType]);

  if (!isOpen) return null;

  const resolvedOffset =
    reminderSel === -1
      ? (customMinutes === '' ? null : Math.max(0, Number(customMinutes)))
      : reminderSel;

  const save = () => {
    if (!title || !date) return;
    const payload: CalendarItem = {
      ...(editItem?.id ? { id: editItem.id } : {}),
      type,
      title,
      date,
      ...(hasDetails ? { details: details || null } : {}),
      ...(hasTime ? { time: time || null } : {}),
      ...(hasLength ? { length: length === '' ? null : Number(length) } : {}),
      reminder_offset_minutes: resolvedOffset === null ? 0 : resolvedOffset, // default 0
      reminder_channels: {
        email: !!reminderChannels.email,
        telegram: !!reminderChannels.telegram,
        inapp: !!reminderChannels.inapp,
      },
    };
    onSubmit(payload);
  };

  const labelCls = 'mb-1 block text-sm';
  const inputCls = 'w-full rounded border border-purple-600 bg-blue-900 p-2';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="w-[420px] rounded-xl border border-purple-600 bg-blue-950 p-6 text-white shadow-lg">
        <h3 className="mb-3 text-lg font-semibold text-purple-200">
          {editItem ? 'Edit Calendar Item' : 'Create Calendar Item'}
        </h3>

        <div className="space-y-3">
          <div>
            <label className={labelCls}>Title</label>
            <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="What is this about?" />
          </div>

          <div>
            <label className={labelCls}>Type</label>
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="task">Task</option>
              <option value="event">Event</option>
              <option value="reminder">Reminder</option>
              <option value="notification">Notification</option>
              <option value="note">Note</option>
            </select>
          </div>

          <div>
            <label className={labelCls}>Date</label>
            <input type="date" className={inputCls} value={date} onChange={(e) => setDate(e.target.value)} />
          </div>

          {hasTime ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>
                  Time <span className="text-xs text-purple-300">(optional)</span>
                </label>
                <input type="time" className={inputCls} value={time} onChange={(e) => setTime(e.target.value)} />
              </div>
              {hasLength ? (
                <div>
                  <label className={labelCls}>
                    Length (minutes) <span className="text-xs text-purple-300">(optional)</span>
                  </label>
                  <input
                    type="number"
                    min={0}
                    className={inputCls}
                    value={length}
                    onChange={(e) => setLength(e.target.value === '' ? '' : Number(e.target.value))}
                  />
                </div>
              ) : null}
            </div>
          ) : null}

          {hasDetails ? (
            <div>
              <label className={labelCls}>
                Details <span className="text-xs text-purple-300">(optional)</span>
              </label>
              <textarea
                className={inputCls}
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                placeholder="Notes, location, etc."
              />
            </div>
          ) : null}

          {/* Reminder options */}
          <div className="grid gap-2">
            <label className={labelCls}>Reminder</label>
            <div className="grid grid-cols-2 gap-3">
              <select
                className={inputCls}
                value={reminderSel}
                onChange={(e) => setReminderSel(Number(e.target.value))}
              >
                {REMINDER_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                disabled={reminderSel !== -1}
                className={inputCls + (reminderSel !== -1 ? ' opacity-50' : '')}
                placeholder="Custom minutes"
                value={customMinutes}
                onChange={(e) => setCustomMinutes(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>

            <div className="mt-2 text-sm text-purple-200">Delivery channels</div>
            <div className="flex gap-4 text-sm">
              {(['telegram', 'email', 'inapp'] as const).map((ch) => (
                <label key={ch} className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="accent-purple-500"
                    checked={!!(reminderChannels as any)[ch]}
                    onChange={(e) =>
                      setReminderChannels((prev) => ({ ...prev, [ch]: e.target.checked } as any))
                    }
                  />
                  {ch === 'inapp' ? 'In-app' : ch[0].toUpperCase() + ch.slice(1)}
                </label>
              ))}
            </div>
          </div>
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
