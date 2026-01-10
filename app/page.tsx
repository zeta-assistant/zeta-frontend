'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import Header from '@/components/Header';
import { supabase } from '@/lib/supabaseClient';
import { getPlanFromUser, PLAN_LIMIT, type Plan } from '@/lib/plan';
import { PlanTag } from '@/components/ui/ZetaPremiumMark';

// Optional XP utils. Falls back gracefully if not present.
let getXPProgress: ((xp: number) => any) | undefined;
let LEVELS: Array<{ level: number; title: string }> | undefined;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const xp = require('@/lib/XP');
  getXPProgress = xp.getXPProgress;
  LEVELS = xp.LEVELS;
} catch {
  /* noop */
}

/* ========================= Types ========================= */

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

type ProjectRowRaw = Record<string, any>;

type Project = {
  id: string;
  name: string;
  levelNum?: number;
  levelTitle?: string;
  createdAt?: string | null;
};

type FeaturedTemplate = {
  key: string; // e.g. 'zeta learn'
  title: string; // e.g. 'Zeta Learn'
  tagline: string; // short one-liner
  description: string; // hero paragraph
  primaryCtaText: string;
  primaryHref: string; // e.g. '/onboarding?template=zeta%20learn'
  secondaryCtaText: string;
  secondaryHref: string; // usually login or learn more
  imageSrc: string; // big hero image
  bullets: Array<{ icon: string; title: string; desc: string }>; // 3 cards
};

/* ========================= Constants ========================= */

const DEFAULT_AVATAR_SRC = '/user-faceless.svg';
const ZETA_SHOWCASE_SRC = '/framed-agents/zeta-framed.png';

// ✅ Change THIS later to feature Chef/Trainer/etc.
// Example swap later:
// key:'zeta chef', title:'Zeta Chef', primaryHref:'/onboarding?template=zeta%20chef', bullets:[...]
const FEATURED_TEMPLATE: FeaturedTemplate = {
  key: 'zeta learn',
  title: 'Zeta Learn',
  tagline: 'Your AI study coach',
  description:
    'Upload notes. Get quizzes. Stay on schedule. Zeta can check in, track weak topics, and keep you consistent until exam day.',
  primaryCtaText: 'Try Zeta Learn →',
  primaryHref: '/onboarding?template=zeta%20learn',
  secondaryCtaText: 'Login',
  secondaryHref: '/login',
  imageSrc: ZETA_SHOWCASE_SRC,
  bullets: [
    {
      icon: '📝',
      title: 'Quizzes from your notes',
      desc: 'Turn lectures, PDFs, and dot points into flashcards, MCQs, and short-answer quizzes in seconds.',
    },
    {
      icon: '📅',
      title: 'Deadlines → a real plan',
      desc: 'Zeta turns “exam on the 12th” into a weekly plan, reminders, and daily study blocks you can follow.',
    },
    {
      icon: '⚡',
      title: 'Accountability + progress',
      desc: 'Zeta messages you first, checks in daily, tracks weak areas, and adapts your revision plan over time.',
    },
  ],
};

// Lightweight fallback in case XP utils aren't available
const fallbackLevelFromXP = (xp: number) =>
  Math.max(1, Math.min(10, Math.floor(xp / 100) + 1));
const fallbackTitleFromLevel = (lvl: number) => `Lv ${lvl}`;

/* ========================= Helpers ========================= */

function normStr(v: any): string {
  return (v ?? '').toString().trim();
}

function getProjectLevel(row: ProjectRowRaw): {
  levelNum: number;
  levelTitle: string;
} | null {
  const direct = Number(row.level ?? row.project_level ?? row.lvl ?? Number.NaN);
  if (Number.isFinite(direct) && direct > 0) {
    const title =
      LEVELS?.find((l) => l.level === direct)?.title ?? `Lv ${direct}`;
    return { levelNum: direct, levelTitle: title };
  }

  const xp = Number(row.xp ?? row.total_xp ?? row.project_xp ?? Number.NaN);
  if (Number.isFinite(xp) && xp >= 0) {
    if (typeof getXPProgress === 'function') {
      try {
        const gp: any = getXPProgress(xp);
        const levelNum = gp?.level ?? gp?.currentLevel ?? gp?.levelNumber ?? 1;
        const title =
          LEVELS?.find((l) => l.level === levelNum)?.title ??
          `Lv ${levelNum}`;
        return { levelNum, levelTitle: title };
      } catch {
        /* ignore and fall back */
      }
    }
    const lvl = fallbackLevelFromXP(xp);
    return { levelNum: lvl, levelTitle: fallbackTitleFromLevel(lvl) };
  }

  return null;
}

function normalizeProject(row: ProjectRowRaw): Project {
  const id =
    normStr(row.id) ||
    (typeof crypto !== 'undefined'
      ? crypto.randomUUID()
      : `tmp_${Date.now()}`);

  const name =
    normStr(row.name) ||
    normStr(row.title) ||
    normStr(row.project_name) ||
    normStr(row.projectTitle) ||
    'Untitled';

  const lvl = getProjectLevel(row);

  return {
    id,
    name,
    ...(lvl ?? {}),
    createdAt: row.created_at ?? row.createdAt ?? null,
  };
}

/* ========================= Page ========================= */

export default function HomePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [sessionInfo, setSessionInfo] = useState<SessionSummary | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        const session = data?.session ?? null;

        if (!session?.user) {
          setSessionInfo(null);
          setProjects([]);
          setLoading(false);
          return;
        }

        const u = session.user;
        const plan = getPlanFromUser(u);

        // usage count
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
        const selfDescription =
          (u.user_metadata?.self_description as string) || '';
        const avatarUrl =
          (u.user_metadata?.profile_image_url as string) || '';

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

        // fetch projects
        const { data: rows, error: projErr } = await supabase
          .from('user_projects')
          .select('*')
          .eq('user_id', u.id)
          .order('created_at', { ascending: false });

        if (projErr) {
          console.error('projects fetch error', projErr);
          setProjects([]);
        } else {
          const mapped = (rows || []).map(normalizeProject);
          setProjects(mapped);
        }
      } catch (e) {
        console.error(e);
        setSessionInfo(null);
        setProjects([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const PlanBadge = useMemo(
    () =>
      function Badge({ plan }: { plan: Plan }) {
        const isPremium = plan === 'premium';
        return (
          <span
            className={[
              'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs border',
              isPremium
                ? 'border-amber-400 bg-white text-amber-700'
                : 'border-slate-300 bg-white text-slate-700',
            ].join(' ')}
          >
            <span aria-hidden>{isPremium ? '👑' : '🟢'}</span>
            <span className="font-semibold">
              {isPremium ? 'Premium' : 'Free'}
            </span>
          </span>
        );
      },
    []
  );

  const isAuthed = !!sessionInfo;

  /* ===================== Logged-OUT Landing ===================== */
  if (!isAuthed) {
    return (
      <main className="relative min-h-screen bg-gradient-to-br from-[#0f1b3d] via-[#1d2d6b] to-[#2438a6] text-white">
        <Header authed={false} />

        {/* Platform Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 mt-10 text-center">
          <div className="mx-auto flex flex-col items-center">
            <Image
              src={ZETA_SHOWCASE_SRC}
              alt="Zeta"
              width={170}
              height={170}
              className="rounded-2xl"
              priority
            />

            <h1 className="mt-5 text-4xl md:text-5xl font-extrabold text-white">
              Pantheon{' '}
              <span className="text-indigo-300">Personal Superintelligence</span>
            </h1>

            <p className="mt-4 text-lg text-slate-200 max-w-3xl mx-auto">
              Pantheon is home to Zeta — your customizable AI assistant. Zeta can
              take initiative, send reminders, and help you make real progress on
              goals.
            </p>

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="rounded-full bg-white px-6 py-3 text-[#0f1b3d] font-semibold hover:bg-slate-100 transition"
              >
                Get started →
              </button>
              <button
                type="button"
                onClick={() => router.push('/login')}
                className="rounded-full bg-indigo-500 px-6 py-3 text-white font-medium hover:bg-indigo-600 transition"
              >
                Login
              </button>
            </div>
          </div>
        </section>

        {/* Featured Template */}
        <section className="mx-auto mt-12 w-full max-w-6xl px-4">
          <div className="rounded-3xl bg-white/10 ring-1 ring-white/15 p-6 md:p-8">
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
              <div className="text-left">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-100 ring-1 ring-white/10">
                  <span aria-hidden>⭐</span>
                  <span className="font-semibold">Featured Template</span>
                </div>

                <h2 className="mt-3 text-2xl md:text-3xl font-extrabold text-white">
                  {FEATURED_TEMPLATE.title}{' '}
                  <span className="text-indigo-300">
                    — {FEATURED_TEMPLATE.tagline}
                  </span>
                </h2>

                <p className="mt-3 text-slate-200 max-w-2xl">
                  {FEATURED_TEMPLATE.description}
                </p>

                <div className="mt-5 flex flex-col sm:flex-row gap-3">
                  <Link
                    href={FEATURED_TEMPLATE.primaryHref}
                    className="w-fit rounded-full bg-white px-6 py-3 text-[#0f1b3d] font-semibold hover:bg-slate-100 transition"
                  >
                    {FEATURED_TEMPLATE.primaryCtaText}
                  </Link>
                  <Link
                    href={FEATURED_TEMPLATE.secondaryHref}
                    className="w-fit rounded-full bg-indigo-500 px-6 py-3 text-white font-medium hover:bg-indigo-600 transition"
                  >
                    {FEATURED_TEMPLATE.secondaryCtaText}
                  </Link>
                </div>
              </div>

              <div className="flex justify-center md:justify-end">
                <Image
                  src={FEATURED_TEMPLATE.imageSrc}
                  alt={FEATURED_TEMPLATE.title}
                  width={160}
                  height={160}
                  className="rounded-2xl"
                />
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              {FEATURED_TEMPLATE.bullets.map((b) => (
                <div
                  key={b.title}
                  className="rounded-2xl bg-white p-6 shadow ring-1 ring-black/5"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-xl">
                      <span aria-hidden>{b.icon}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {b.title}
                    </h3>
                  </div>
                  <p className="mt-3 text-sm text-gray-600">{b.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Premium */}
        <section className="mx-auto mt-16 flex flex-col md:flex-row items-center justify-center gap-8 max-w-5xl px-4 text-center md:text-left">
          <div className="flex-shrink-0">
            <Image
              src="/zeta-premium.png"
              alt="Zeta Premium"
              width={180}
              height={180}
              className="mx-auto"
            />
          </div>
          <div>
            <h2 className="text-3xl font-bold text-white mb-2">Zeta Premium</h2>
            <p className="text-slate-200 text-lg max-w-md">
              Higher limits, deeper memory, and stronger autonomy — built for
              people who want Zeta to run alongside them daily.
            </p>

            <ul className="mt-3 text-slate-100 text-sm space-y-1">
              <li>✅ Advanced memory & long-term context</li>
              <li>✅ Smarter notifications & initiative</li>
              <li>✅ More projects & higher limits</li>
              <li>✅ Deeper customization & control</li>
            </ul>

            <button
              type="button"
              onClick={() => router.push('/login')}
              className="mt-5 inline-block rounded-full bg-amber-500 px-6 py-3 text-white font-semibold hover:bg-amber-600 transition"
            >
              Upgrade to Premium
            </button>
          </div>
        </section>

        {/* 🔒 Overlay: click anywhere in main area → /login */}
        <div
          className="fixed left-0 right-0 top-0 bottom-24 z-50 cursor-pointer"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            router.push('/login');
          }}
        />
      </main>
    );
  }

  /* ===================== Logged-IN Home ===================== */
  const { plan, username, selfDescription, avatarUrl, used, limit } = sessionInfo;
  const remaining = Math.max(0, limit - used);
  const avatarSrc = avatarUrl || DEFAULT_AVATAR_SRC;
  const progressPct = Math.min(
    100,
    Math.round((used / Math.max(1, limit)) * 100)
  );

  return (
    <main className="min-h-screen bg-gradient-to-br from-[#0f1b3d] via-[#1d2d6b] to-[#2438a6] text-white">
      <Header
        authed
        avatarUrl={avatarSrc}
        planPill={<PlanTag plan={plan} />}
        onLogout={async () => {
          await supabase.auth.signOut();
          window.location.assign('/');
        }}
      />

      {/* Account summary */}
      <section className="mx-auto mt-8 w-full max-w-6xl px-4">
        <div className="grid grid-cols-1 gap-6 rounded-2xl bg-white p-6 shadow ring-1 ring-black/5 md:grid-cols-2">
          {/* Profile */}
          <div className="col-span-1 flex items-start gap-4">
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
                <h2 className="truncate text-xl font-semibold text-gray-900">
                  {username || 'User'}
                </h2>
                <PlanBadge plan={plan} />
              </div>
              <p className="mt-1 line-clamp-3 text-sm text-gray-600">
                {selfDescription ||
                  'Tell Zeta about your goals in Settings → Profile.'}
              </p>
              <div className="mt-3 flex gap-2">
                <Link
                  href="/settings"
                  className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  Edit profile
                </Link>
                <Link
                  href="/projects"
                  className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500"
                >
                  Open Projects
                </Link>
              </div>
            </div>
          </div>

          {/* Usage */}
          <div className="col-span-1">
            <div className="text-sm font-medium text-gray-700">Projects</div>
            <div className="mt-1 text-3xl font-extrabold text-gray-900">
              {used}{' '}
              <span className="text-base font-medium text-gray-500">
                / {limit}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-2 bg-indigo-500"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {remaining === 0 ? 'Limit reached' : `${remaining} remaining`}
            </div>
            <div className="mt-3 flex gap-2">
              <Link
                href="/onboarding"
                className="rounded-md bg-black px-3 py-1.5 text-xs text-white hover:bg-gray-800"
              >
                + New Project
              </Link>
              <Link
                href="/upgrade"
                className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
              >
                {plan === 'premium' ? 'Manage Billing' : 'Upgrade'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Template (authed) */}
      <section className="mx-auto mt-10 w-full max-w-6xl px-4">
        <div className="rounded-3xl bg-white/10 ring-1 ring-white/15 p-6 md:p-8">
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
            <div className="text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs text-slate-100 ring-1 ring-white/10">
                <span aria-hidden>⭐</span>
                <span className="font-semibold">Featured Template</span>
              </div>

              <h2 className="mt-3 text-2xl md:text-3xl font-extrabold text-white">
                {FEATURED_TEMPLATE.title}{' '}
                <span className="text-indigo-300">
                  — {FEATURED_TEMPLATE.tagline}
                </span>
              </h2>

              <p className="mt-3 text-slate-200 max-w-2xl">
                {FEATURED_TEMPLATE.description}
              </p>

              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <Link
                  href={FEATURED_TEMPLATE.primaryHref}
                  className="w-fit rounded-full bg-white px-6 py-3 text-[#0f1b3d] font-semibold hover:bg-slate-100 transition"
                >
                  {FEATURED_TEMPLATE.primaryCtaText}
                </Link>
                <Link
                  href="/projects"
                  className="w-fit rounded-full bg-indigo-500 px-6 py-3 text-white font-medium hover:bg-indigo-600 transition"
                >
                  View projects
                </Link>
              </div>
            </div>

            <div className="flex justify-center md:justify-end">
              <Image
                src={FEATURED_TEMPLATE.imageSrc}
                alt={FEATURED_TEMPLATE.title}
                width={140}
                height={140}
                className="rounded-2xl"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Projects list */}
      <section className="mx-auto mt-8 w-full max-w-6xl px-4 pb-12">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-semibold text-white">Recent Projects</h3>
          <Link
            href="/onboarding"
            className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-[#0f1b3d] hover:bg-slate-100 transition"
          >
            Create a new project →
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.length === 0 ? (
            <div className="rounded-2xl bg-white p-6 text-gray-800 shadow ring-1 ring-black/5">
              <div className="flex items-center gap-3">
                <Image
                  src={ZETA_SHOWCASE_SRC}
                  alt="Zeta"
                  width={44}
                  height={44}
                  className="rounded-xl"
                />
                <div>
                  <div className="font-semibold">No projects yet</div>
                  <div className="text-sm text-gray-600">
                    Create your first project and let Zeta start organizing it.
                  </div>
                </div>
              </div>
              <Link
                href="/onboarding"
                className="mt-4 inline-block rounded-md bg-black px-3 py-2 text-xs text-white hover:bg-gray-800"
              >
                + New Project
              </Link>
            </div>
          ) : (
            projects.map((p) => (
              <Link
                key={p.id}
                href={`/dashboard/${p.id}`}
                className="group rounded-2xl bg-white p-6 text-gray-800 shadow ring-1 ring-black/5 hover:shadow-md transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{p.name}</div>
                    <div className="mt-1 text-xs text-gray-600">
                      Open with Zeta →
                    </div>
                  </div>

                  {p.levelNum ? (
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] text-indigo-700">
                        Lv {p.levelNum}
                      </span>
                      <span className="whitespace-nowrap rounded-full border border-slate-300 px-2 py-0.5 text-[10px] text-slate-700">
                        {p.levelTitle ?? `Lv ${p.levelNum}`}
                      </span>
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
                  <Image
                    src={ZETA_SHOWCASE_SRC}
                    alt="Zeta"
                    width={18}
                    height={18}
                    className="rounded-md"
                  />
                  <span>Zeta-powered</span>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>
    </main>
  );
}
