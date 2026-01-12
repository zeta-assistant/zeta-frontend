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

// Put your VAPID public key in env (must be exposed to client):
// NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

type SectionCardProps = {
  title: string;
  subtitle?: string;
  icon?: string;
  children: React.ReactNode;
};

const SectionCard = ({ title, subtitle, icon, children }: SectionCardProps) => (
  <div className="w-full h-full rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-[0_10px_30px_rgba(0,0,0,0.25)]">
    <div className="px-5 pt-5 pb-3 border-b border-white/10">
      <div className="flex items-start gap-3">
        {icon && (
          <div className="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-lg">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-white leading-tight">{title}</h3>
          {subtitle && <p className="text-sm text-white/70 mt-1">{subtitle}</p>}
        </div>
      </div>
    </div>

    <div className="p-5">{children}</div>
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
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="min-w-0">
        <div className="text-sm font-medium text-white truncate">
          {i.type === 'telegram' ? 'Telegram' : 'Email'} — {display}
        </div>
        <div className="mt-2">
          {verified ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-200 ring-1 ring-inset ring-green-400/20">
              ✓ Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-100 ring-1 ring-inset ring-amber-400/20">
              ⏳ Pending
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {i.type === 'email' && onSendTest && display && (
          <button
            className="text-sm rounded-xl border border-white/15 bg-white/5 px-3 py-1.5 text-white hover:bg-white/10"
            onClick={() => onSendTest(display)}
          >
            Send test
          </button>
        )}
        <button
          className="text-sm font-medium text-red-300 hover:text-red-200 hover:underline"
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

  // Push UI state
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState<string>('');

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
        .select('id, project_id, type, value, email_address, is_verified, user_chat_id, created_at')
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

    if (!projectId || !isUUID(projectId)) return fail('❌ Invalid project id (must be a UUID).');
    if (!value) return fail('❌ Please enter an email address.');
    if (!isEmail(value)) return fail('❌ Please enter a valid email.');

    setLoading(true);
    try {
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
        fail(`❌ Failed to add Email: ${error.message || error.code || 'unknown'} ${error.details ?? ''}`);
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
    if (error) return fail(`❌ Failed to remove: ${error.message || error.code}`);
    fetchIntegrations();
  };

  const sendTestEmail = async (to: string) => {
    setFeedback('');
    setTestBusy(true);
    try {
      const { error } = await supabase.functions.invoke('send-email-message', {
        body: {
          to,
          subject: 'Zeta test email',
          message: 'Hello from Zeta! This is a test notification via Resend (zeta@pantheonagents.com).',
        },
      });

      if (error) fail(`❌ Failed to send: ${error.message || JSON.stringify(error)}`);
      else setFeedback('✅ Test email sent. Check your inbox/spam.');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Unknown error';
      fail(`❌ Failed to send: ${msg}`);
    } finally {
      setTestBusy(false);
    }
  };

  /* ---------- Push (Web Push) ---------- */
  const getSWRegistration = async () => {
    if (!('serviceWorker' in navigator)) throw new Error('Service workers not supported on this device.');
    const reg = await navigator.serviceWorker.ready;
    return reg;
  };

  const debugSW = async () => {
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sw = reg?.active?.scriptURL || 'none';
      const scope = reg?.scope || 'none';
      console.log('SW active:', sw);
      console.log('SW scope:', scope);
      alert(`SW: ${sw}\nScope: ${scope}\nPermission: ${Notification?.permission ?? 'n/a'}`);
    } catch (e: any) {
      alert(`SW debug failed: ${e?.message ?? String(e)}`);
    }
  };

  const manualNotifyTest = async () => {
    setFeedback('');
    setPushStatus('');
    try {
      const reg = await getSWRegistration();
      if (!reg?.active) throw new Error('No active service worker found.');
      reg.active.postMessage({ type: 'SHOW_TEST_NOTIFICATION' });
      setPushStatus('Sent message to SW ✅ (a notification should appear immediately)');
    } catch (e: any) {
      fail(`❌ Manual notify test failed: ${e?.message ?? String(e)}`);
    }
  };

  const enablePush = async () => {
    setFeedback('');
    setPushStatus('');
    setPushBusy(true);

    try {
      if (!VAPID_PUBLIC_KEY) throw new Error('Missing NEXT_PUBLIC_VAPID_PUBLIC_KEY env var.');
      if (!('Notification' in window)) throw new Error('Notifications not supported in this browser.');

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatus(`Permission: ${permission}`);
        return;
      }

      const reg = await getSWRegistration();

      // If already subscribed, re-save it to DB so the server uses the correct endpoint.
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      const { data, error } = await supabase.functions.invoke('push-subscribe', {
  body: { projectId, subscription: sub },
});

console.log('push-subscribe raw:', { data, error });

// IMPORTANT: show real status + body (iPhone hides this otherwise)
if (error) {
  // @ts-ignore
  const status = error?.context?.status ?? error?.status ?? 'unknown';
  // @ts-ignore
  const body = error?.context?.body ?? error?.context ?? error;

  console.error('push-subscribe failed:', { status, body });
  throw new Error(`push-subscribe failed (status=${status}): ${JSON.stringify(body)}`);
}

setPushStatus('Subscribed + saved ✅');
setFeedback('✅ Push enabled.');

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      fail(`❌ Push setup failed: ${msg}`);
    } finally {
      setPushBusy(false);
    }
  };

  const sendTestPush = async () => {
    setFeedback('');
    setPushStatus('');
    setPushBusy(true);

    try {
      const { data, error } = await supabase.functions.invoke('push-send-test', {
  body: { projectId },
});

console.log('push-send-test raw:', { data, error });

if (error) {
  // @ts-ignore
  const status = error?.context?.status ?? error?.status ?? 'unknown';
  // @ts-ignore
  const body = error?.context?.body ?? error?.context ?? error;

  console.error('push-send-test failed:', { status, body });
  throw new Error(`push-send-test failed (status=${status}): ${JSON.stringify(body)}`);
}

const status = (data as any)?.push_status;
const ok = (data as any)?.ok;

setPushStatus(
  ok
    ? `Push request accepted ✅ (push_status=${status ?? 'n/a'})`
    : `Push not ok ❌ (push_status=${status ?? 'n/a'})`
);

setFeedback('✅ Test push request sent (check notification).');

    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'unknown error';
      fail(`❌ Test push failed: ${msg}`);
    } finally {
      setPushBusy(false);
    }
  };

  /* ---------- UI ---------- */
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">
            Integrations
          </h2>
          <p className="mt-1 text-sm text-white/70">
            Connect channels for notifications and project updates.
          </p>
        </div>

        <button
          onClick={fetchIntegrations}
          className="shrink-0 rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
        >
          Refresh
        </button>
      </div>

      {feedback && (
        <div className="mb-5 rounded-xl border border-amber-300/30 bg-amber-500/10 px-4 py-3 text-amber-100">
          {feedback}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-stretch">
        {/* Telegram */}
        <SectionCard
          icon="✈️"
          title="Telegram"
          subtitle="Receive DMs from your Zeta project."
        >
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
            <p className="font-semibold text-white">Connect (10 seconds)</p>
            <ol className="list-decimal ml-5 mt-2 space-y-1">
              <li>Open Telegram.</li>
              <li>
                In <span className="font-mono">@{BOT_USERNAME}</span>, send:{' '}
                <span className="font-mono">/start proj_{projectId}</span>
              </li>
              <li>Hit Refresh → you’ll see “Verified”.</li>
            </ol>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={openTelegramForProject}
                className="rounded-xl bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700"
              >
                Open Telegram
              </button>
              <button
                type="button"
                onClick={copyStartCommand}
                className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-white hover:bg-white/10"
              >
                Copy “/start …”
              </button>
            </div>
          </div>

          <div className="mt-4 space-y-2 max-h-40 overflow-auto pr-1">
            {telegramIntegrations.length > 0 ? (
              telegramIntegrations.map((i) => (
                <ItemRow key={i.id} i={i} onDelete={deleteIntegration} />
              ))
            ) : (
              <div className="text-sm text-white/60">No Telegram recipients yet.</div>
            )}
          </div>
        </SectionCard>

        {/* Email */}
        <SectionCard
          icon="📧"
          title="Email"
          subtitle={`Save emails to receive notifications. ${FROM_HINT}`}
        >
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="email"
                className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-white/20"
                placeholder="name@example.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
              />
              <button
                onClick={addEmail}
                disabled={loading}
                className="rounded-xl bg-blue-600 px-4 py-2 text-white shadow hover:bg-blue-700 disabled:opacity-50"
              >
                {loading ? 'Adding…' : 'Add'}
              </button>
            </div>

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
              className="w-full rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-white hover:bg-white/10 disabled:opacity-50"
            >
              {testBusy ? 'Sending…' : 'Send test to first email'}
            </button>

            <div className="mt-1 text-xs text-white/55">
              We’re skipping email verification for now — add multiple and remove anytime.
            </div>

            <div className="mt-3 space-y-2 max-h-40 overflow-auto pr-1">
              {emailIntegrations.length > 0 ? (
                emailIntegrations.map((i) => (
                  <ItemRow
                    key={i.id}
                    i={i}
                    onDelete={deleteIntegration}
                    onSendTest={sendTestEmail}
                  />
                ))
              ) : (
                <div className="text-sm text-white/60">No email recipients yet.</div>
              )}
            </div>
          </div>
        </SectionCard>

        {/* Push Notifications */}
        <SectionCard
          icon="🔔"
          title="Push Notifications"
          subtitle="Enable iPhone home-screen push alerts for this app."
        >
          <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/80">
            <ul className="list-disc ml-5 space-y-1">
              <li>Must be installed via “Add to Home Screen”.</li>
              <li>Permission appears after you press Enable.</li>
            </ul>
          </div>

          <div className="mt-4 flex flex-col gap-2">
            <button
              type="button"
              onClick={enablePush}
              disabled={pushBusy}
              className="rounded-xl bg-indigo-600 px-4 py-2 text-white shadow hover:bg-indigo-700 disabled:opacity-50"
            >
              {pushBusy ? 'Working…' : 'Enable Notifications'}
            </button>

            <button
              type="button"
              onClick={sendTestPush}
              disabled={pushBusy}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-white hover:bg-white/10 disabled:opacity-50"
            >
              Send test push
            </button>

            {/* Debug tools */}
            <button
              type="button"
              onClick={manualNotifyTest}
              disabled={pushBusy}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-white hover:bg-white/10 disabled:opacity-50"
            >
              Manual notify test (SW)
            </button>

            <button
              type="button"
              onClick={debugSW}
              className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-white hover:bg-white/10"
            >
              Debug SW (show active SW URL)
            </button>

            {pushStatus && (
              <div className="mt-2 text-xs text-white/70">
                <span className="font-mono">{pushStatus}</span>
              </div>
            )}

            {!VAPID_PUBLIC_KEY && (
              <div className="mt-2 text-xs text-red-300">
                Missing env: <span className="font-mono">NEXT_PUBLIC_VAPID_PUBLIC_KEY</span>
              </div>
            )}

            <div className="mt-2 text-xs text-white/55">
              Needs Edge Functions: <span className="font-mono">push-subscribe</span> and{' '}
              <span className="font-mono">push-send-test</span>.
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
