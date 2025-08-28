'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

type Integration = {
  id: string;
  project_id: string;
  type: 'email' | 'telegram' | 'slack' | 'discord';
  value: string | null;
  email_address?: string | null;
  is_verified: boolean | null;
  user_chat_id?: string | null;
  created_at?: string;
};

type Props = {
  fontSize?: 'sm' | 'base' | 'lg';
  projectId: string;
};

const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const isUUID = (s: string) => /^[0-9a-fA-F-]{36}$/.test(s || '');
const BOT_USERNAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'yogizeta_bot';
const FROM_HINT = 'Emails are sent by your function using zeta@pantheonagents.com';

type SectionCardProps = { title: string; subtitle?: string; children: React.ReactNode };
const SectionCard = ({ title, subtitle, children }: SectionCardProps) => (
  <div className="rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur p-5 max-w-xl w-full">
    <div className="mb-4">
      <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
      {subtitle && <p className="text-sm text-slate-600 mt-1">{subtitle}</p>}
    </div>
    {children}
  </div>
);

type ItemRowProps = {
  i: Integration;
  onDelete: (id: string) => void;
  onSendTest?: (to: string) => void;
};
const ItemRow = ({ i, onDelete, onSendTest }: ItemRowProps) => {
  const display =
    i.type === 'email'
      ? i.email_address ?? i.value ?? ''
      : i.value ?? i.user_chat_id ?? '';
  const verified = Boolean(i.is_verified);

  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900 truncate">
          {i.type === 'telegram' ? 'Telegram' : 'Email'} — {display}
        </div>
        <div className="mt-1">
          {verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-200">
              ✓ Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-200">
              ⏳ Pending
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {i.type === 'email' && onSendTest && display && (
          <button
            className="text-sm rounded-md border border-slate-300 px-3 py-1.5 hover:bg-slate-50"
            onClick={() => onSendTest(display)}
          >
            Send test
          </button>
        )}
        <button
          className="text-sm font-medium text-red-600 hover:underline"
          onClick={() => onDelete(i.id)}
        >
          Remove
        </button>
      </div>
    </div>
  );
};

export default function APIsTab({ fontSize = 'base', projectId }: Props) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string>('');
  const [emailInput, setEmailInput] = useState('');
  const [testBusy, setTestBusy] = useState(false);

  const telegramIntegrations = useMemo(
    () => integrations.filter((i) => i.type === 'telegram'),
    [integrations]
  );
  const emailIntegrations = useMemo(
    () => integrations.filter((i) => i.type === 'email'),
    [integrations]
  );

  const fail = (msg: string) => setFeedback(msg);

  const fetchIntegrations = useCallback(async () => {
    if (!projectId) return;
    try {
      const { data, error } = await supabase
        .from('project_integrations')
        .select(
          'id, project_id, type, value, email_address, is_verified, user_chat_id, created_at'
        )
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) {
        return fail(
          `❌ Fetch failed: ${error.message || error.code || 'unknown'} ${error.details ?? ''}`
        );
      }
      setIntegrations((data || []) as Integration[]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      fail(`❌ Fetch failed: ${msg}`);
    }
  }, [projectId]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  /* ---------- Telegram ---------- */
  const openTelegramForProject = () => {
    const payload = `proj_${projectId}`;
    const ua = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

    if (isMobile) {
      const tme = `https://t.me/${BOT_USERNAME}?start=${payload}`;
      const w = window.open(tme, '_blank', 'noopener,noreferrer');
      if (!w) fail('Popup blocked. Allow popups and try again, or use the fallback link below.');
      return;
    }

    const webA = `https://web.telegram.org/a/#?tgaddr=resolve?domain=${BOT_USERNAME}&start=${payload}`;
    const w = window.open(webA, '_blank', 'noopener,noreferrer');
    if (!w) fail('Popup blocked. Allow popups for this site or use the fallback link below.');
  };

  const copyStartCommand = async () => {
    const text = `/start proj_${projectId}`;
    try {
      await navigator.clipboard.writeText(text);
      setFeedback('📋 Copied. Paste into your Telegram bot chat.');
    } catch {
      fail('Copy failed. Select and copy this command: ' + text);
    }
  };

  /* ---------- Email CRUD + Test ----------- */
  const addEmail = async () => {
    setFeedback('');
    const value = emailInput.trim();

    if (!projectId || !isUUID(projectId)) {
      return fail('❌ Invalid project id (must be a UUID).');
    }
    if (!value) return fail('❌ Please enter an email address.');
    if (!isEmail(value)) return fail('❌ Please enter a valid email.');
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('project_integrations')
        .insert([
          {
            project_id: projectId,
            type: 'email',
            value,
            email_address: value,
            is_verified: true,
          },
        ])
        .select()
        .single();

      if (error) {
        fail(
          `❌ Failed to add Email: ${error.message || error.code || 'unknown'} ${error.details ?? ''}`
        );
        setLoading(false);
        return;
      }

      setEmailInput('');
      await fetchIntegrations();
      setFeedback('✅ Email saved.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      fail(`❌ Failed to add Email: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const deleteIntegration = async (id: string) => {
    const { error } = await supabase.from('project_integrations').delete().eq('id', id);
    if (error) {
      return fail(`❌ Failed to remove: ${error.message || error.code}`);
    }
    fetchIntegrations();
  };

  const sendTestEmail = async (to: string) => {
    setFeedback('');
    setTestBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('send-email-message', {
        body: {
          to,
          subject: 'Zeta test email',
          message:
            'Hello from Zeta! This is a test notification via Resend (zeta@pantheonagents.com).',
        },
      });
      if (error) {
        fail(`❌ Failed to send: ${error.message || JSON.stringify(error)}`);
      } else {
        setFeedback('✅ Test email sent. Check your inbox/spam.');
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      fail(`❌ Failed to send: ${msg}`);
    } finally {
      setTestBusy(false);
    }
  };

  /* ---------- UI ---------- */
  return (
    <div className="max-w-6xl mx-auto space-y-8 px-4">
      <div className="rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-3 shadow">
        <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          🔌 Connected Integrations
        </h2>
      </div>

      {feedback && (
        <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 justify-items-center">
        {/* Telegram */}
        <SectionCard title="Telegram" subtitle="Receive DMs from your Zeta project.">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 mb-4">
            <p className="font-medium">Connect (10 seconds)</p>
            <ol className="list-decimal ml-5 mt-2 space-y-1">
              <li>Open Telegram in a new tab.</li>
              <li>
                In the bot chat <span className="font-mono">@{BOT_USERNAME}</span>, send:{' '}
                <span className="font-mono">/start proj_{projectId}</span>
              </li>
              <li>Hit Refresh here → you’ll see “Verified”.</li>
            </ol>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openTelegramForProject}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700"
              >
                Open Telegram (new tab)
              </button>
              <button
                type="button"
                onClick={copyStartCommand}
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                Copy “/start proj…”
              </button>
              <button
                onClick={fetchIntegrations}
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="space-y-2 w-full">
            {telegramIntegrations.length > 0 ? (
              telegramIntegrations.map((i) => (
                <ItemRow key={i.id} i={i} onDelete={deleteIntegration} />
              ))
            ) : (
              <div className="text-sm text-slate-500">No Telegram recipients yet.</div>
            )}
          </div>
        </SectionCard>

        {/* Email */}
        <SectionCard title="Email" subtitle={`Save emails to receive notifications. ${FROM_HINT}`}>
          <div className="space-y-3 w-full">
            {emailIntegrations.length > 0 && (
              <div className="space-y-2">
                {emailIntegrations.map((i) => (
                  <ItemRow
                    key={i.id}
                    i={i}
                    onDelete={deleteIntegration}
                    onSendTest={sendTestEmail}
                  />
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <input
                type="email"
                className="flex-1 rounded-lg border border-slate-300 bg-white p-2 text-black"
                placeholder="name@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              <button
                onClick={addEmail}
                disabled={loading}
                className="rounded-lg bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Adding…' : 'Add'}
              </button>
            </div>

            <div className="pt-2">
              <button
                onClick={() => {
                  const to =
                    emailIntegrations[0]?.email_address ||
                    emailIntegrations[0]?.value ||
                    emailInput.trim();
                  if (!to || !isEmail(to)) {
                    fail('❌ Add a valid email first.');
                    return;
                  }
                  if (!testBusy) sendTestEmail(to);
                }}
                disabled={testBusy}
                className="rounded-lg border border-slate-300 px-4 py-2 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {testBusy ? 'Sending…' : 'Send test to first email'}
              </button>
            </div>

            <p className="text-xs text-slate-500">
              We’re skipping email verification for now — add multiple and remove anytime.
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
