// app/support/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

type FormState = {
  name: string;
  email: string;
  subject: string;
  message: string;
};

export default function SupportPage() {
  const [form, setForm] = useState<FormState>({
    name: '',
    email: '',
    subject: '',
    message: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [ok, setOk] = useState<null | string>(null);
  const [err, setErr] = useState<null | string>(null);

  // Prefill name/email if the user is logged in
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      const u = data?.session?.user;
      if (!u) return;
      const name =
        (u.user_metadata?.user_name as string) ||
        (u.user_metadata?.username as string) ||
        (u.email?.split('@')[0] as string) ||
        '';
      setForm((f) => ({ ...f, name, email: u.email ?? f.email }));
    })();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setOk(null);
    setErr(null);
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.success === false) {
        throw new Error(json?.error || 'Failed to send message');
      }
      setOk('Thanks! Your message has been sent.');
      setForm({ name: form.name, email: form.email, subject: '', message: '' });
    } catch (e: any) {
      setErr(e?.message || 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-indigo-100">
      {/* Header */}
      <header className="flex justify-between items-center px-8 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/pantheon.png" alt="Pantheon" width={40} height={40} />
          <span className="text-lg font-semibold text-gray-800">Pantheon</span>
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/projects" className="text-gray-700 hover:text-indigo-600">Projects</Link>
          <Link href="/settings" className="text-gray-700 hover:text-indigo-600">Account</Link>
        </nav>
      </header>

      <section className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-gray-900">Support</h1>
        <p className="mt-2 text-gray-600">
          Send feedback, report an issue, or ask for help. We usually reply within 24h.
        </p>

        <form onSubmit={onSubmit} className="mt-6 bg-white rounded-2xl p-6 shadow ring-1 ring-black/5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Name</label>
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Your name"
                required
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Email</label>
              <input
                type="email"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Subject</label>
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              placeholder="Brief summary"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">Message</label>
            <textarea
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm min-h-[140px]"
              value={form.message}
              onChange={(e) => setForm({ ...form, message: e.target.value })}
              placeholder="How can we help?"
              required
            />
          </div>

          {ok && <div className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-3 py-2">{ok}</div>}
          {err && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">{err}</div>}

          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={submitting}
              className={`px-4 py-2 rounded-md text-white text-sm ${
                submitting ? 'bg-indigo-300 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-500'
              }`}
            >
              {submitting ? 'Sending…' : 'Send message'}
            </button>

            {/* Optional: link to start a Zeta help chat for logged-in users */}
            <Link
              href="/dashboard/help"
              className="text-sm px-3 py-2 rounded-md border text-gray-700 hover:bg-gray-50"
            >
              Start a help chat with Zeta
            </Link>
          </div>
        </form>

        <p className="mt-4 text-xs text-gray-500">
          We may use your email to follow up on your request. No spam.
        </p>
      </section>
    </main>
  );
}
