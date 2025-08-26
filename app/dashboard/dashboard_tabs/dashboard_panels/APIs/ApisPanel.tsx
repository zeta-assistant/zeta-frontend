'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

/* ========= Types ========= */
type Integration = {
  id: string;
  project_id: string;
  type: 'email' | 'telegram' | 'slack' | 'discord';
  value: string | null;
  email_address?: string | null;
  is_verified: boolean | null;
  user_chat_id?: string | null;
};

type Props = {
  fontSize?: 'sm' | 'base' | 'lg';
  projectId: string;
};

/* ========= Helpers ========= */
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
const BOT_USERNAME =
  process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || 'yogizeta_bot';

/* ========= Presentational ========= */
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

type ItemRowProps = { i: Integration; onDelete: (id: string) => void };
const ItemRow = ({ i, onDelete }: ItemRowProps) => {
  const display =
    i.type === 'email'
      ? i.email_address ?? i.value ?? ''
      : i.value ?? i.user_chat_id ?? '';
  const verified = Boolean(i.is_verified);
  return (
    <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div>
        <div className="text-sm font-medium text-slate-900">
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
      <button
        className="text-sm font-medium text-red-600 hover:underline"
        onClick={() => onDelete(i.id)}
      >
        Remove
      </button>
    </div>
  );
};

/* ========= Main ========= */
export default function APIsTab({ fontSize = 'base', projectId }: Props) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<string>('');
  const [emailInput, setEmailInput] = useState('');

  const telegramIntegrations = useMemo(
    () => integrations.filter((i) => i.type === 'telegram'),
    [integrations]
  );
  const emailIntegrations = useMemo(
    () => integrations.filter((i) => i.type === 'email'),
    [integrations]
  );

  const fetchIntegrations = useCallback(async () => {
    if (!projectId) return;
    try {
      const { data, error } = await supabase
        .from('project_integrations')
        .select('id, project_id, type, value, email_address, is_verified, user_chat_id')
        .eq('project_id', projectId);

      if (error) {
        setFeedback(
          `❌ Failed to fetch integrations: ${error.message || error.code || 'unknown error'}`
        );
        return;
      }
      setIntegrations((data || []) as Integration[]);
    } catch (e: any) {
      setFeedback(`❌ Failed to fetch integrations: ${e?.message ?? 'unknown error'}`);
    }
  }, [projectId]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  /* ---------- Telegram open (NEW TAB) ---------- */
  const openTelegramForProject = () => {
    const payload = `proj_${projectId}`;
    const ua = navigator.userAgent || '';
    const isMobile = /Android|iPhone|iPad|iPod/i.test(ua);

    // Prefer t.me on mobile (hands off to app/store gracefully)
    if (isMobile) {
      const tme = `https://t.me/${BOT_USERNAME}?start=${payload}`;
      const w = window.open(tme, '_blank', 'noopener,noreferrer');
      if (!w) setFeedback('Popup blocked. Allow popups and try again, or use the fallback link below.');
      return;
    }

    // Desktop: Telegram Web (new client "a"), fallback is shown as a link below
    const webA = `https://web.telegram.org/a/#?tgaddr=resolve?domain=${BOT_USERNAME}&start=${payload}`;
    const w = window.open(webA, '_blank', 'noopener,noreferrer');
    if (!w) {
      setFeedback('Popup blocked. Allow popups for this site or use the fallback link below.');
    }
  };

  const copyStartCommand = async () => {
    const text = `/start proj_${projectId}`;
    try {
      await navigator.clipboard.writeText(text);
      setFeedback('📋 Copied. Paste into your Telegram bot chat.');
    } catch {
      setFeedback('Copy failed. Select and copy this command: ' + text);
    }
  };

  /* ---------- Email ----------- */
  const addEmail = async () => {
    setFeedback('');
    const value = emailInput.trim();
    if (!value) return setFeedback('❌ Please enter an email address.');
    if (!isEmail(value)) return setFeedback('❌ Please enter a valid email.');
    setLoading(true);

    const { error } = await supabase.from('project_integrations').insert([
      {
        project_id: projectId,
        type: 'email',
        value,
        email_address: value,
        is_verified: true,
      },
    ]);

    if (error) {
      console.error(error);
      setFeedback('❌ Failed to add Email.');
      setLoading(false);
      return;
    }

    setEmailInput('');
    await fetchIntegrations();
    setLoading(false);
    setFeedback('✅ Email saved.');
  };

  const deleteIntegration = async (id: string) => {
    const { error } = await supabase.from('project_integrations').delete().eq('id', id);
    if (error) {
      setFeedback(`❌ Failed to remove: ${error.message || error.code}`);
      return;
    }
    fetchIntegrations();
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
              <li>
                Click <b>Open Telegram</b>. It opens in a <b>new tab</b> (or app on mobile).
              </li>
              <li>
                In the bot chat <span className="font-mono">@{BOT_USERNAME}</span>, send:{' '}
                <span className="font-mono">/start proj_{projectId}</span>
              </li>
              <li>Come back and hit <b>Refresh</b>. You’ll see “Verified”.</li>
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

            <p className="mt-3 text-xs text-slate-500">
              Fallback links:{' '}
              <a
                className="underline"
                href={`https://t.me/${BOT_USERNAME}?start=proj_${projectId}`}
                target="_blank"
                rel="noreferrer"
              >
                t.me/{BOT_USERNAME}
              </a>{' '}
              ·{' '}
              <a
                className="underline"
                href={`https://web.telegram.org/a/#?tgaddr=resolve?domain=${BOT_USERNAME}&start=proj_${projectId}`}
                target="_blank"
                rel="noreferrer"
              >
                Telegram Web
              </a>
            </p>
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
        <SectionCard title="Email" subtitle="Save an email to use for notifications.">
          <div className="space-y-3 w-full">
            {emailIntegrations.length > 0 && (
              <div className="space-y-2">
                {emailIntegrations.map((i) => (
                  <ItemRow key={i.id} i={i} onDelete={deleteIntegration} />
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

            <p className="text-xs text-slate-500">
              We’re skipping email verification for now — add multiple and remove anytime.
            </p>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
