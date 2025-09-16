// app/page.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import { getPlanFromUser, PLAN_LIMIT, type Plan } from '@/lib/plan';
import { PlanTag } from '@/components/ui/ZetaPremiumMark';

type SessionSummary = {
  userId: string;
  email: string | null;
  plan: Plan;
  username: string;
  selfDescription: string;
  avatarUrl: string; // may be ''
  used: number;
  limit: number;
};

const DEFAULT_AVATAR_SRC = '/user-faceless.svg';

export default function HomePage() {
  const [loading, setLoading] = useState(true);
  const [sessionInfo, setSessionInfo] = useState<SessionSummary | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;
        if (!session?.user) {
          setSessionInfo(null);
          setLoading(false);
          return;
        }

        const u = session.user;
        const plan = getPlanFromUser(u);

        // project usage
        const { count } = await supabase
          .from('user_projects')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', u.id);

        const used = count ?? 0;
        const limit = PLAN_LIMIT[plan];

        // profile fields
        const username =
          (u.user_metadata?.user_name as string) ||
          (u.user_metadata?.username as string) ||
          (u.email?.split('@')[0] as string) ||
          '';
        const selfDescription = (u.user_metadata?.self_description as string) || '';
        const avatarUrl = (u.user_metadata?.profile_image_url as string) || '';

        setSessionInfo({
          userId: u.id,
          email: u.email ?? null,
          plan,
          username,
          selfDescription,
          avatarUrl,
          used,
          limit,
        });
      } catch {
        setSessionInfo(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Define hooks BEFORE any conditional return (prevents hook order errors)
  const PlanBadge = useMemo(
    () =>
      function Badge({ plan }: { plan: Plan }) {
        const isPremium = plan === 'premium';
        return (
          <span
            className={[
              'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border',
              isPremium ? 'border-amber-400 bg-white text-amber-700' : 'border-slate-300 bg-white text-slate-700',
            ].join(' ')}
          >
            <span aria-hidden>{isPremium ? '👑' : '🟢'}</span>
            <span className="font-semibold">{isPremium ? 'Premium' : 'Free'}</span>
          </span>
        );
      },
    []
  );

  const isAuthed = !!sessionInfo;

  /* ===================== Logged-OUT Landing ===================== */
  if (!isAuthed) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-sky-50 to-indigo-100">
        {/* Header */}
        <header className="flex justify-between items-center px-8 py-4">
          <div className="flex items-center gap-3">
            <Image src="/pantheon.png" alt="Pantheon Logo" width={48} height={48} priority />
            <span className="text-xl font-semibold text-gray-800">Pantheon</span>
          </div>
          <nav className="flex items-center gap-6">
            <Link href="/projects" className="text-gray-700 hover:text-indigo-600">
              Projects
            </Link>
            <Link href="/settings" className="text-gray-700 hover:text-indigo-600">
              Account
            </Link>
            <Link href="/support" className="text-gray-700 hover:text-indigo-600">
              Support
            </Link>
            <Link
              href="/login?next=/"
              className="px-4 py-1.5 rounded-md bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-500"
            >
              Log in
            </Link>
          </nav>
        </header>

        {/* Hero */}
        <section className="text-center mt-16">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900">
            Pantheon <span className="text-indigo-600">Personal Superintelligence</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Not just another chatbot. Pantheon adds memory, initiative, notifications,
            files, goals & tasks — and works with any model (including custom).
          </p>
        </section>

        {/* Feature cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-4xl mx-auto mt-16 px-6">
          <div className="p-6 rounded-xl bg-white shadow hover:shadow-md">
            <h3 className="text-lg font-semibold text-gray-800">Build with Zeta</h3>
            <p className="mt-2 text-sm text-gray-600">
              Organize, plan, and achieve your goals. Build timelines, custom notifications,
              and track projects across work, side hustles, and hobbies.
            </p>
          </div>
          <div className="p-6 rounded-xl bg-white shadow hover:shadow-md relative">
            <span className="absolute top-2 right-2 text-xs bg-yellow-300 px-2 py-0.5 rounded-md">
              Coming soon
            </span>
            <h3 className="text-lg font-semibold text-gray-800">Learn with Theta</h3>
          </div>
          <div className="p-6 rounded-xl bg-white shadow hover:shadow-md relative">
            <span className="absolute top-2 right-2 text-xs bg-yellow-300 px-2 py-0.5 rounded-md">
              Coming soon
            </span>
            <h3 className="text-lg font-semibold text-gray-800">Grow with Delta</h3>
          </div>
        </section>

        {/* Meet Zeta + Matrix */}
        <section className="max-w-5xl mx-auto mt-20 px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 bg-white p-8 rounded-2xl shadow">
            <div>
              <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
                <Image src="/zeta-avatar.svg" alt="Zeta" width={40} height={40} />
                Meet Zeta
              </h2>
              <p className="mt-4 text-gray-600">
                Your AI teammate that helps you plan, generate, and execute with daily momentum:
              </p>
              <ul className="mt-4 text-gray-600 list-disc list-inside space-y-1">
                <li>Organizes your projects and goals</li>
                <li>Builds timelines and custom notifications</li>
                <li>Tracks personal, work, and side hustles</li>
                <li>Provides daily outreach & momentum</li>
              </ul>
            </div>

            <div className="overflow-x-auto">
              <h3 className="text-lg font-semibold text-gray-800 mb-4">How Pantheon compares</h3>
              <table className="w-full border text-sm text-left border-gray-200">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="px-3 py-2 border">Capability</th>
                    <th className="px-3 py-2 border">Pantheon Agents</th>
                    <th className="px-3 py-2 border">ChatGPT</th>
                    <th className="px-3 py-2 border">Claude</th>
                    <th className="px-3 py-2 border">Gemini</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="px-3 py-2 border">Chatbot and conversation abilities</td>
                    <td className="px-3 py-2 border text-green-600">✓</td>
                    <td className="px-3 py-2 border text-green-600">✓</td>
                    <td className="px-3 py-2 border text-green-600">✓</td>
                    <td className="px-3 py-2 border text-green-600">✓</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border">Proactive notifications & outreach</td>
                    <td className="px-3 py-2 border text-green-600">✓</td>
                    <td className="px-3 py-2 border text-red-500">✗</td>
                    <td className="px-3 py-2 border text-red-500">✗</td>
                    <td className="px-3 py-2 border text-red-500">✗</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border">Project-based memory architecture & file management</td>
                    <td className="px-3 py-2 border text-green-600">✓</td>
                    <td className="px-3 py-2 border text-red-500">✗</td>
                    <td className="px-3 py-2 border text-red-500">✗</td>
                    <td className="px-3 py-2 border text-red-500">✗</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border">
                      Calendar scheme creation, goal development & project timeline tracking
                    </td>
                    <td className="px-3 py-2 border text-green-600">✓</td>
                    <td className="px-3 py-2 border text-red-500">✗</td>
                    <td className="px-3 py-2 border text-red-500">✗</td>
                    <td className="px-3 py-2 border text-red-500">✗</td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 border">User-based & agent-based task generation</td>
                    <td className="px-3 py-2 border text-green-600">✓</td>
                    <td className="px-3 py-2 border text-red-500">✗</td>
                    <td className="px-3 py-2 border text-red-500">✗</td>
                    <td className="px-3 py-2 border text-red-500">✗</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Zeta Premium */}
        <section className="max-w-3xl mx-auto mt-16 px-6 text-center">
          <Image src="/zeta-premium.png" alt="Zeta Premium" width={180} height={180} className="mx-auto" />
          <h2 className="mt-6 text-2xl font-bold text-gray-800">Zeta Premium</h2>
          <p className="mt-2 text-gray-600">
            Unlock more features, deeper customization, and advanced tools designed
            to supercharge your projects and personal growth.
          </p>
        </section>

        <footer className="mt-20 text-center text-sm text-gray-500 py-6">
          © {new Date().getFullYear()} Pantheon. All rights reserved.
        </footer>
      </main>
    );
  }

  /* ===================== Logged-IN Home ===================== */
  const { email, plan, username, selfDescription, avatarUrl, used, limit } = sessionInfo;
  const remaining = Math.max(0, limit - used);
  const avatarSrc = avatarUrl || DEFAULT_AVATAR_SRC;
  const progressPct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-indigo-100">
      {/* Header (logged-in) */}
      <header className="flex justify-between items-center px-8 py-4">
        <Link href="/" className="flex items-center gap-3">
          <Image src="/pantheon.png" alt="Pantheon Logo" width={48} height={48} priority />
          <span className="text-xl font-semibold text-gray-800">Pantheon</span>
        </Link>

        <nav className="flex items-center gap-4">
          <Link href="/projects" className="text-gray-700 hover:text-indigo-600">
            Projects
          </Link>
          <Link href="/settings" className="text-gray-700 hover:text-indigo-600">
            Account
          </Link>
          <Link href="/support" className="text-gray-700 hover:text-indigo-600">
            Support
          </Link>

          {/* Avatar + Logout (replaces Login button) */}
          <div className="hidden sm:flex items-center gap-3 pl-3 ml-3 border-l">
            {/* avatar links to settings */}
            <Link href="/settings" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarSrc}
                alt={username || 'User'}
                width={32}
                height={32}
                className="rounded-full border bg-gray-50 object-cover w-8 h-8"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR_SRC;
                }}
              />
            </Link>
            {/* optional small plan tag */}
            <PlanTag plan={plan} />
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                // Hard reload so header updates immediately
                window.location.assign('/');
              }}
              className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-500"
            >
              Log out
            </button>
          </div>
        </nav>
      </header>

      {/* Account summary bubble */}
      <section className="max-w-6xl mx-auto mt-8 px-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white p-6 rounded-2xl shadow ring-1 ring-black/5">
          {/* Profile left */}
          <div className="col-span-1 flex gap-4 items-start">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={avatarSrc}
              alt="Avatar"
              width={72}
              height={72}
              className="rounded-xl border bg-gray-50 object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR_SRC;
              }}
            />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-semibold text-gray-900 truncate">{username || 'User'}</h2>
                <PlanBadge plan={plan} />
              </div>
              <p className="text-sm text-gray-600 mt-1 line-clamp-3">
                {selfDescription || 'Tell Zeta about your goals in Settings → Profile.'}
              </p>
              <div className="mt-3 flex gap-2">
                <Link href="/settings" className="text-xs px-3 py-1.5 rounded-md border text-gray-700 hover:bg-gray-50">
                  Edit profile
                </Link>
                <Link href="/projects" className="text-xs px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-500">
                  Open Projects
                </Link>
              </div>
            </div>
          </div>

          {/* Usage middle */}
          <div className="col-span-1">
            <div className="text-sm text-gray-700 font-medium">Projects</div>
            <div className="mt-1 text-3xl font-extrabold text-gray-900">
              {used} <span className="text-base font-medium text-gray-500">/ {limit}</span>
            </div>
            <div className="mt-2 h-2 rounded-full bg-gray-200 overflow-hidden">
              <div className="h-2 bg-indigo-500" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-1 text-xs text-gray-500">{remaining === 0 ? 'Limit reached' : `${remaining} remaining`}</div>

            <div className="mt-3 flex gap-2">
              <Link href="/onboarding" className="text-xs px-3 py-1.5 rounded-md bg-black text-white hover:bg-gray-800">
                + New Project
              </Link>
              <Link href="/upgrade" className="text-xs px-3 py-1.5 rounded-md border text-gray-700 hover:bg-gray-50">
                {plan === 'premium' ? 'Manage Billing' : 'Upgrade'}
              </Link>
            </div>
          </div>

          {/* Quick tips / links right */}
          <div className="col-span-1">
            <div className="text-sm text-gray-700 font-medium">Quick actions</div>
            <ul className="mt-2 text-sm text-gray-700 space-y-2">
              <li>
                <Link href="/support" className="underline hover:no-underline">
                  Contact support
                </Link>
              </li>
              <li>
                <Link href="/settings" className="underline hover:no-underline">
                  Customize notifications
                </Link>
              </li>
              <li>
                <Link href="/projects" className="underline hover:no-underline">
                  Jump back into your projects
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Keep your public marketing sections below for logged-in users too */}
      {/* Differentiation cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-6 max-w-5xl mx-auto mt-10 px-6">
        <div className="p-6 rounded-xl bg-white shadow">
          <h3 className="text-lg font-semibold text-gray-800">Build with Zeta</h3>
          <p className="mt-2 text-sm text-gray-600">
            Organize, plan, and achieve your goals. Build timelines, custom notifications,
            and track projects across work, side hustles, and hobbies.
          </p>
        </div>
        <div className="p-6 rounded-xl bg-white shadow relative">
          <span className="absolute top-2 right-2 text-xs bg-yellow-300 px-2 py-0.5 rounded-md">Coming soon</span>
          <h3 className="text-lg font-semibold text-gray-800">Learn with Theta</h3>
        </div>
        <div className="p-6 rounded-xl bg-white shadow relative">
          <span className="absolute top-2 right-2 text-xs bg-yellow-300 px-2 py-0.5 rounded-md">Coming soon</span>
          <h3 className="text-lg font-semibold text-gray-800">Grow with Delta</h3>
        </div>
      </section>

      <footer className="mt-16 text-center text-sm text-gray-500 py-6">
        © {new Date().getFullYear()} Pantheon. All rights reserved.
      </footer>
    </main>
  );
}
