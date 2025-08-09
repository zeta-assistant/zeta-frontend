'use client';

import React, { useEffect, useMemo, useState } from 'react';

type Channel = 'In-app' | 'Telegram' | 'Email';
type Frequency = 'Off' | 'Hourly' | 'Daily' | 'Weekdays' | 'Weekly' | 'Monthly' | 'Custom';
type RuleType = 'custom' | 'relevant_discussion';

type CustomNotification = {
  id: string;
  name: string;
  message: string;
  channel: Channel;
  frequency: Frequency;
  time?: string;       // HH:MM (local)
  dayOfWeek?: number;  // 0-6 for Weekly
  type?: RuleType;
  isPreset?: boolean;
};

type Props = {
  fontSize: 'sm' | 'base' | 'lg';
  projectId: string;
};

export default function NotificationsPanel({ fontSize, projectId }: Props) {
  // ===== Outreach (Zeta) settings =====
  const [outreachEnabled, setOutreachEnabled] = useState(true);
  const [outreachFrequency, setOutreachFrequency] = useState<Frequency>('Daily');
  const [outreachTime, setOutreachTime] = useState('09:00'); // default 9AM
  const [outreachDayOfWeek, setOutreachDayOfWeek] = useState<number>(1); // Monday

  // ===== Custom notifications (in-memory placeholder) =====
  const [rules, setRules] = useState<CustomNotification[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formMessage, setFormMessage] = useState('');
  const [formChannel, setFormChannel] = useState<Channel>('In-app');
  const [formFrequency, setFormFrequency] = useState<Frequency>('Daily');
  const [formTime, setFormTime] = useState('10:00');
  const [formDayOfWeek, setFormDayOfWeek] = useState<number>(1);

  // ===== Edge function config & helpers =====
  const FN_URL =
    (process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '') ?? '') +
    '/functions/v1/relevantdiscussion';

  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  async function callRelevantDiscussion(body: Record<string, any>) {
    setSending(true);
    setToast(null);
    try {
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      setToast(res.ok ? '✅ Sent!' : `❌ Failed (${res.status})`);
    } catch (e: any) {
      setToast(`❌ Error: ${e?.message ?? 'unknown'}`);
    } finally {
      setSending(false);
      setTimeout(() => setToast(null), 3000);
    }
  }

  function sendRuleNow(rule: CustomNotification) {
    if (!projectId) {
      setToast('⚠️ Missing projectId');
      return;
    }

    if (rule.type === 'relevant_discussion') {
      // Use most recent daily memory for THIS project
      callRelevantDiscussion({
        project_id: projectId,
        channels: { inapp: true, telegram: true, email: true },
        subject: '💬 Zeta Discussion',
      });
      return;
    }

    // Default custom message path
    if (!rule.message?.trim()) {
      setToast('⚠️ Rule message is empty');
      return;
    }
    callRelevantDiscussion({
      project_id: projectId,
      override_text: rule.message.trim(),
      channels: { inapp: true, telegram: true, email: true },
      subject: rule.name?.trim() ? `💬 ${rule.name.trim()}` : '💬 Zeta Custom Notification',
    });
  }

  // Seed the preset “Relevant Discussion” rule once
  useEffect(() => {
    setRules((prev) => {
      if (prev.some((r) => r.type === 'relevant_discussion')) return prev;
      const preset: CustomNotification = {
        id: 'preset-relevant-discussion',
        name: 'Relevant Discussion',
        message: 'Auto-generates a short discussion prompt from the latest daily memory.',
        channel: 'In-app',
        frequency: 'Daily',
        time: '09:00',
        type: 'relevant_discussion',
        isPreset: true,
      };
      return [preset, ...prev];
    });
  }, []);

  const dayLabels = useMemo(
    () => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    []
  );

  function resetForm() {
    setFormName('');
    setFormMessage('');
    setFormChannel('In-app');
    setFormFrequency('Daily');
    setFormTime('10:00');
    setFormDayOfWeek(1);
    setEditingId(null);
  }

  function openCreate() {
    resetForm();
    setShowForm(true);
  }

  function openEdit(rule: CustomNotification) {
    setEditingId(rule.id);
    setFormName(rule.name);
    setFormMessage(rule.message);
    setFormChannel(rule.channel);
    setFormFrequency(rule.frequency);
    setFormTime(rule.time ?? '10:00');
    setFormDayOfWeek(rule.dayOfWeek ?? 1);
    setShowForm(true);
  }

  function saveRule() {
    if (!formName.trim() || !formMessage.trim()) return;

    const payload: CustomNotification = {
      id: editingId ?? crypto.randomUUID(),
      name: formName.trim(),
      message: formMessage.trim(),
      channel: formChannel,
      frequency: formFrequency,
      time: ['Daily', 'Weekdays', 'Weekly', 'Monthly', 'Custom'].includes(formFrequency)
        ? formTime
        : undefined,
      dayOfWeek: formFrequency === 'Weekly' ? formDayOfWeek : undefined,
      type: 'custom',
      isPreset: false,
    };

    setRules((prev) => {
      if (editingId) {
        return prev.map((r) => (r.id === editingId ? payload : r));
      }
      return [payload, ...prev];
    });

    setShowForm(false);
    resetForm();
  }

  function deleteRule(id: string) {
    setRules((prev) => prev.filter((r) => r.id !== id));
  }

  return (
    <div className={`p-6 overflow-y-auto text-${fontSize} text-indigo-200 space-y-6`}>
      {/* 🔔 Header */}
      <div>
        <h2 className="text-lg text-white font-semibold">🔔 Notification Settings</h2>
        <p className="text-gray-400 text-sm mt-1">
          Manage how and when Zeta sends you alerts, updates, and reminders.
        </p>
      </div>

      {/* === Outreach Chat Frequency (Zeta) === */}
      <div className="bg-blue-950 border border-blue-400 rounded-lg p-4 shadow space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium">💬 Outreach Messages from Zeta</div>
          <label className="flex items-center gap-2 text-xs">
            <span className={outreachEnabled ? 'text-green-400' : 'text-gray-400'}>
              {outreachEnabled ? 'Enabled' : 'Disabled'}
            </span>
            <input
              type="checkbox"
              checked={outreachEnabled}
              onChange={(e) => setOutreachEnabled(e.target.checked)}
              className="accent-green-500"
            />
          </label>
        </div>

        <div
          className={`grid grid-cols-1 md:grid-cols-3 gap-3 ${
            !outreachEnabled ? 'opacity-50 pointer-events-none' : ''
          }`}
        >
          <div>
            <label className="block text-xs text-gray-400 mb-1">Frequency</label>
            <select
              value={outreachFrequency}
              onChange={(e) => setOutreachFrequency(e.target.value as Frequency)}
              className="w-full bg-blue-900/50 border border-blue-400 rounded px-3 py-2 text-indigo-100"
            >
              <option>Off</option>
              <option>Hourly</option>
              <option>Daily</option>
              <option>Weekdays</option>
              <option>Weekly</option>
              <option>Monthly</option>
              <option>Custom</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Send Time</label>
            <input
              type="time"
              value={outreachTime}
              onChange={(e) => setOutreachTime(e.target.value)}
              className="w-full bg-blue-900/50 border border-blue-400 rounded px-3 py-2 text-indigo-100"
            />
          </div>

          {outreachFrequency === 'Weekly' && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Day of Week</label>
              <select
                value={outreachDayOfWeek}
                onChange={(e) => setOutreachDayOfWeek(parseInt(e.target.value, 10))}
                className="w-full bg-blue-900/50 border border-blue-400 rounded px-3 py-2 text-indigo-100"
              >
                {dayLabels.map((d, i) => (
                  <option key={d} value={i}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <p className="text-xs text-gray-400">
          Placeholder only — wire this to your <code>daily-chat-message</code> cron + Supabase later.
        </p>
      </div>

      {/* === Custom Notifications === */}
      <div className="bg-blue-950 border border-purple-400 rounded-lg p-4 shadow">
        <div className="flex items-center justify-between">
          <div className="font-medium">🧩 Custom Notifications</div>
          <button
            onClick={openCreate}
            className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-sm"
          >
            ➕ New
          </button>
        </div>
        <p className="text-gray-400 text-xs mt-1">
          Create simple rules that send messages to a channel on a schedule.
        </p>

        {/* List */}
        {rules.length === 0 ? (
          <div className="mt-4 text-xs text-gray-400">No custom notifications yet.</div>
        ) : (
          <ul className="mt-4 space-y-2">
            {rules.map((r) => (
              <li
                key={r.id}
                className="bg-blue-900/40 border border-blue-600 rounded p-3 flex items-start justify-between gap-3"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-indigo-100">{r.name}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-blue-400">
                      {r.channel}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-purple-400">
                      {r.frequency}
                    </span>
                    {r.time && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-400">
                        {r.time}
                      </span>
                    )}
                    {r.dayOfWeek !== undefined && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-indigo-400">
                        {dayLabels[r.dayOfWeek]}
                      </span>
                    )}
                    {r.isPreset && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full border border-green-400">
                        Preset
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-indigo-200 whitespace-pre-wrap">{r.message}</div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={sending}
                    onClick={() => sendRuleNow(r)}
                    className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-1 rounded"
                    title="Send this notification now"
                  >
                    {sending ? 'Sending…' : 'Send'}
                  </button>

                  {!r.isPreset && (
                    <>
                      <button
                        onClick={() => openEdit(r)}
                        className="text-xs bg-blue-700 hover:bg-blue-800 text-white px-3 py-1 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteRule(r.id)}
                        className="text-xs bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {toast && <div className="text-xs mt-2">{toast}</div>}
      </div>

      {/* === Drawer / Modal (simple) === */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 z-40 flex items-end md:items-center md:justify-center">
          <div className="w-full md:w-[560px] bg-blue-950 border border-purple-500 rounded-t-2xl md:rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-white font-semibold">
                {editingId ? 'Edit Custom Notification' : 'New Custom Notification'}
              </div>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="text-gray-300 hover:text-white"
                title="Close"
              >
                ✖
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Name</label>
                <input
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g., Morning Check-in"
                  className="w-full bg-blue-900/50 border border-blue-400 rounded px-3 py-2 text-indigo-100"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Channel</label>
                <select
                  value={formChannel}
                  onChange={(e) => setFormChannel(e.target.value as Channel)}
                  className="w-full bg-blue-900/50 border border-blue-400 rounded px-3 py-2 text-indigo-100"
                >
                  <option>In-app</option>
                  <option>Telegram</option>
                  <option>Email</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Frequency</label>
                <select
                  value={formFrequency}
                  onChange={(e) => setFormFrequency(e.target.value as Frequency)}
                  className="w-full bg-blue-900/50 border border-blue-400 rounded px-3 py-2 text-indigo-100"
                >
                  <option>Hourly</option>
                  <option>Daily</option>
                  <option>Weekdays</option>
                  <option>Weekly</option>
                  <option>Monthly</option>
                  <option>Custom</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">Send Time</label>
                <input
                  type="time"
                  value={formTime}
                  onChange={(e) => setFormTime(e.target.value)}
                  className="w-full bg-blue-900/50 border border-blue-400 rounded px-3 py-2 text-indigo-100"
                />
              </div>

              {formFrequency === 'Weekly' && (
                <div>
                  <label className="block text-xs text-gray-400 mb-1">Day of Week</label>
                  <select
                    value={formDayOfWeek}
                    onChange={(e) => setFormDayOfWeek(parseInt(e.target.value, 10))}
                    className="w-full bg-blue-900/50 border border-blue-400 rounded px-3 py-2 text-indigo-100"
                  >
                    {dayLabels.map((d, i) => (
                      <option key={d} value={i}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block text-xs text-gray-400 mb-1">Message</label>
                <textarea
                  value={formMessage}
                  onChange={(e) => setFormMessage(e.target.value)}
                  rows={4}
                  placeholder="What should Zeta send?"
                  className="w-full bg-blue-900/50 border border-blue-400 rounded px-3 py-2 text-indigo-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="px-4 py-2 text-sm rounded border border-blue-400 text-indigo-100 hover:bg-blue-900/40"
              >
                Cancel
              </button>
              <button
                onClick={saveRule}
                className="px-4 py-2 text-sm rounded bg-purple-600 hover:bg-purple-700 text-white"
              >
                {editingId ? 'Save Changes' : 'Create Rule'}
              </button>
            </div>

            <p className="text-[11px] text-gray-400">
              Placeholder only — persist to <code>notification_rules</code> and a scheduler table when you’re ready.
            </p>
          </div>
        </div>
      )}

      {/* Legacy examples */}
      <div className="grid md:grid-cols-3 gap-3">
        <div className="bg-blue-950 border border-blue-400 rounded-lg p-4 shadow">
          <div className="flex justify-between items-center font-medium">
            <span>📨 Telegram Alerts</span>
            <span className="text-green-400 text-xs">Enabled</span>
          </div>
          <p className="text-gray-400 text-xs mt-1">
            Zeta sends strategy tips, summaries, and time-sensitive prompts via Telegram.
          </p>
        </div>

        <div className="bg-blue-950 border border-yellow-400 rounded-lg p-4 shadow">
          <div className="flex justify-between items-center font-medium">
            <span>📧 Email Reports</span>
            <span className="text-yellow-300 text-xs">Daily</span>
          </div>
          <p className="text-gray-400 text-xs mt-1">
            Daily summaries include progress logs, reminders, and weekly goals.
          </p>
        </div>

        <div className="bg-blue-950 border border-purple-400 rounded-lg p-4 shadow">
          <div className="flex justify-between items-center font-medium">
            <span>🧠 Smart Suggestions</span>
            <span className="text-purple-300 text-xs">Active</span>
          </div>
          <p className="text-gray-400 text-xs mt-1">
            Zeta nudges you when it detects unusual patterns, missed tasks, or new insights.
          </p>
        </div>
      </div>

      <div className="bg-blue-950 border border-red-500 rounded-lg p-4 shadow">
        <div className="flex justify-between items-center font-medium">
          <span>🔕 Do Not Disturb</span>
          <span className="text-red-400 text-xs">Off</span>
        </div>
        <p className="text-gray-400 text-xs mt-1">
          Temporarily pause notifications for focus or personal time.
        </p>
      </div>
    </div>
  );
}