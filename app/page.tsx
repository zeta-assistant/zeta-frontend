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

type Template =
  | 'zeta build'
  | 'zeta learn'
  | 'zeta chef'
  | 'zeta trainer'
  | 'zeta engineer'
  | 'zeta writer'
  | 'zeta motivation'
  | 'zeta quant';

type Project = {
  id: string;
  name: string;
  template: Template;
  levelNum?: number;
  levelTitle?: string;
};

type UseCase = {
  key: string;
  label: string;
  description: string;
  emoji: string;
  href: string;
  recommendedTemplate: Template;
  color: string; // tailwind bg class
};

/* ========================= Constants ========================= */

const DEFAULT_AVATAR_SRC = '/user-faceless.svg';

const TEMPLATE_ICONS: Record<Template, string> = {
  'zeta build': '/templates/zeta-build.png',
  'zeta learn': '/templates/zeta-learn.png',
  'zeta chef': '/templates/zeta-chef.png',
  'zeta trainer': '/templates/zeta-trainer.png',
  'zeta engineer': '/templates/zeta-engineer.png',
  'zeta writer': '/templates/zeta-writer.png',
  'zeta motivation': '/templates/zeta-motivation.png',
  'zeta quant': '/templates/zeta-quant.png',
};

const TEMPLATE_DISPLAY: Record<
  Template,
  { title: string; sub: string; href: string }
> = {
  'zeta build': {
    title: 'Zeta Build',
    sub: 'Plan, ship, and track progress.',
    href: '/onboarding?template=zeta%20build',
  },
  'zeta learn': {
    title: 'Zeta Learn',
    sub: 'Study, research, and write faster.',
    href: '/onboarding?template=zeta%20learn',
  },
  'zeta chef': {
    title: 'Zeta Chef',
    sub: 'Plan meals and generate smart recipes.',
    href: '/onboarding?template=zeta%20chef',
  },
  'zeta trainer': {
    title: 'Zeta Trainer',
    sub: 'Programs, tracking, and coaching.',
    href: '/onboarding?template=zeta%20trainer',
  },
  'zeta engineer': {
    title: 'Zeta Engineer',
    sub: 'Code, debug, and design systems.',
    href: '/onboarding?template=zeta%20engineer',
  },
  'zeta writer': {
    title: 'Zeta Writer',
    sub: 'Concept to outline to polished draft.',
    href: '/onboarding?template=zeta%20writer',
  },
  'zeta motivation': {
    title: 'Zeta Motivation',
    sub: 'Mindset, focus, and momentum.',
    href: '/onboarding?template=zeta%20motivation',
  },
  'zeta quant': {
    title: 'Zeta Quant',
    sub: 'Data, finance, accounting & analysis.',
    href: '/onboarding?template=zeta%20quant',
  },
};

// 5-trait lists shown under each template card
const TEMPLATE_TRAITS: Record<Template, string[]> = {
  'zeta learn': [
    'Math Whiz',
    'Concept Simplifier',
    'Patient Teacher',
    'Pattern Spotter',
    'Curious Explorer',
  ],
  'zeta build': [
    'Goal-Driven',
    'Organized Planner',
    'Strategic Thinker',
    'Visionary Leader',
    'Outcome Oriented',
  ],
  'zeta engineer': [
    'Analytical Mind',
    'Code Architect',
    'Problem Solver',
    'Logical Thinker',
    'Efficiency Optimizer',
  ],
  'zeta writer': [
    'Idea Generator',
    'Creative Thinker',
    'Expressive Communicator',
    'Storyteller',
    'Wordsmith',
  ],
  'zeta trainer': [
    'Motivator',
    'Performance Coach',
    'Habit Architect',
    'Disciplined',
    'Results-Focused',
  ],
  'zeta chef': [
    'Creative Cook',
    'Resourceful Planner',
    'Flavor Experimenter',
    'Nutritional Thinker',
    'Precision Maker',
  ],
  'zeta motivation': [
    'Drive Igniter',
    'Resilience Coach',
    'Mindset Shifter',
    'Focus Builder',
    'Purpose Finder',
  ],
  'zeta quant': [
    'Data Analyst',
    'Financial Thinker',
    'Risk Evaluator',
    'Precision Calculator',
    'Insight Generator',
  ],
};

const KNOWN_TEMPLATES: Template[] = [
  'zeta build',
  'zeta learn',
  'zeta engineer',
  'zeta writer',
  'zeta trainer',
  'zeta chef',
  'zeta motivation',
  'zeta quant',
];

const USE_CASES: UseCase[] = [
  {
    key: 'cooking',
    label: 'Cooking',
    description: 'Plan meals, recipes, and shopping.',
    emoji: '🍳',
    color: 'bg-[#FFEEDB]', // warm cream
    href: '/onboarding?template=zeta%20chef',
    recommendedTemplate: 'zeta chef',
  },
  {
    key: 'learning',
    label: 'Learning',
    description: 'Explore new topics and ideas.',
    emoji: '🧠',
    color: 'bg-[#E3F2FD]', // light blue
    href: '/onboarding?template=zeta%20learn',
    recommendedTemplate: 'zeta learn',
  },
  {
    key: 'studying',
    label: 'Studying',
    description: 'Revise smarter for exams.',
    emoji: '📚',
    color: 'bg-[#F3E5F5]', // soft purple
    href: '/onboarding?template=zeta%20learn',
    recommendedTemplate: 'zeta learn',
  },
  {
    key: 'personal_conversations',
    label: 'Personal Conversations',
    description: 'Talk through situations, get social help, or think out loud.',
    emoji: '💬',
    color: 'bg-[#E8F5E9]', // light mint
    href: '/onboarding?template=zeta%20motivation',
    recommendedTemplate: 'zeta motivation',
  },
  {
    key: 'projects_planning',
    label: 'Projects & Planning',
    description: 'Organize goals, tasks, and life structure.',
    emoji: '📋',
    color: 'bg-[#FFF3CD]', // soft yellow
    href: '/onboarding?template=zeta%20build',
    recommendedTemplate: 'zeta build',
  },
  {
    key: 'exercising',
    label: 'Fitness & Training',
    description: 'Training plans and habit tracking.',
    emoji: '🏋️',
    color: 'bg-[#FDEDEC]', // soft red
    href: '/onboarding?template=zeta%20trainer',
    recommendedTemplate: 'zeta trainer',
  },
  {
    key: 'writing',
    label: 'Writing',
    description: 'Essays, content, and scripts.',
    emoji: '✍️',
    color: 'bg-[#E8EAF6]', // light indigo
    href: '/onboarding?template=zeta%20writer',
    recommendedTemplate: 'zeta writer',
  },
  {
    key: 'money_analysis',
    label: 'Money & Analysis',
    description: 'Track spending, analyze trends, and make informed decisions.',
    emoji: '💹',
    color: 'bg-[#E2F7F6]', // aqua teal
    href: '/onboarding?template=zeta%20quant',
    recommendedTemplate: 'zeta quant',
  },
];

/* ========================= Helpers ========================= */

function classifyTemplateValue(raw: unknown): Template | null {
  const s = (raw ?? '').toString().trim().toLowerCase();
  if (!s) return null;

  // exact matches
  if (KNOWN_TEMPLATES.includes(s as Template)) return s as Template;

  // friendly aliasing
  if (/\bexercise\b/.test(s)) return 'zeta trainer';
  if (/\btrainer\b/.test(s)) return 'zeta trainer';
  if (/\bbuild\b/.test(s)) return 'zeta build';
  if (/\blearn\b/.test(s)) return 'zeta learn';
  if (/\bchef|cook|kitchen|recipe\b/.test(s)) return 'zeta chef';
  if (/\bengineer|code|coder|dev|developer\b/.test(s)) return 'zeta engineer';
  if (/\bwriter|writing|author|copy\b/.test(s)) return 'zeta writer';
  if (/\bmotivation|mindset|sage|emotion\b/.test(s)) return 'zeta motivation';
  if (/\bquant|finance|accounting|analytics|data\b/.test(s)) return 'zeta quant';

  // sometimes template_id is a human slug like "zeta_build" or "build"
  if (/zeta[_\s-]*build/.test(s)) return 'zeta build';
  if (/zeta[_\s-]*learn/.test(s)) return 'zeta learn';
  if (/zeta[_\s-]*chef/.test(s)) return 'zeta chef';
  if (/zeta[_\s-]*trainer|zeta[_\s-]*exercise/.test(s)) return 'zeta trainer';
  if (/zeta[_\s-]*engineer|zeta[_\s-]*code/.test(s)) return 'zeta engineer';
  if (/zeta[_\s-]*writer/.test(s)) return 'zeta writer';
  if (/zeta[_\s-]*motivation|zeta[_\s-]*sage|zeta[_\s-]*emotion/.test(s))
    return 'zeta motivation';
  if (/zeta[_\s-]*quant/.test(s)) return 'zeta quant';

  return null;
}

function normStr(v: any): string {
  return (v ?? '').toString().trim();
}

function normalizeTemplateFromAny(row: ProjectRowRaw): Template {
  // Prefer template_id if present
  const idCandidates = [
    row.template_id,
    row.templateId,
    row.project_template_id,
    row.template_key,
  ];

  for (const c of idCandidates) {
    const t = classifyTemplateValue(c);
    if (t) return t;
  }

  // Then check name-ish fields
  const nameCandidates = [
    row.template,
    row.project_template,
    row.zeta_template,
    row.template_name,
    row.templateSlug,
    row.template_type,
    row.assistant_type, // legacy
    row.agent, // legacy
    row.type, // legacy
  ];
  for (const c of nameCandidates) {
    const t = classifyTemplateValue(c);
    if (t) return t;
  }

  // Last resort: scan all strings in the row
  const hay = Object.values(row)
    .filter((v) => typeof v === 'string')
    .map(normStr)
    .join(' | ');
  const t = classifyTemplateValue(hay);
  if (t) return t;

  // Failsafe: default to Build so nothing goes to "Other"
  return 'zeta build';
}

// Lightweight fallback in case XP utils aren't available
const fallbackLevelFromXP = (xp: number) =>
  Math.max(1, Math.min(10, Math.floor(xp / 100) + 1));
const fallbackTitleFromLevel = (lvl: number) => `Lv ${lvl}`;

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
  const template = normalizeTemplateFromAny(row);
  const lvl = getProjectLevel(row);
  return { id, name, template, ...(lvl ?? {}) };
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

        // fetch projects (all columns)
        const { data: rows, error: projErr } = await supabase
          .from('user_projects')
          .select('*')
          .eq('user_id', u.id);

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

  // Group by template (no "unknown" bucket anymore)
  const byTemplate = useMemo(() => {
    const base: Record<Template, Project[]> = {
      'zeta build': [],
      'zeta learn': [],
      'zeta chef': [],
      'zeta trainer': [],
      'zeta engineer': [],
      'zeta writer': [],
      'zeta motivation': [],
      'zeta quant': [],
    };
    for (const p of projects) {
      base[p.template]?.push(p);
    }
    return base;
  }, [projects]);

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

        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 mt-10 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-white">
            Pantheon{' '}
            <span className="text-indigo-300">Personal Superintelligence</span>
          </h1>
          <p className="mt-4 text-lg text-slate-200 max-w-2xl mx-auto">
            Pantheon is home to Zeta, your customizable AI assistant. Able to
            customize its preset features, personality, and tone, Zeta is you're
            personal superintelligence here to help you achieve your goals in
            whatever way you use AI!
          </p>
        </section>

        {/* What do you use AI for? */}
        <section className="mx-auto mt-12 w-full max-w-5xl px-4">
          <h2 className="text-2xl font-bold text-white text-center">
            What do you use AI for?
          </h2>
          <p className="mt-2 text-sm text-slate-200 text-center max-w-xl mx-auto">
            Tap a tile below and we&rsquo;ll match you to the Zeta agent that
            fits best.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {USE_CASES.map((c) => {
              const rec = TEMPLATE_DISPLAY[c.recommendedTemplate];
              const recIcon = TEMPLATE_ICONS[c.recommendedTemplate];
              return (
                <div
                  key={c.key}
                  className={`group relative flex h-full flex-col justify-between rounded-2xl p-5 text-left shadow-md ring-1 ring-black/10 transition transform hover:-translate-y-1 hover:shadow-lg ${c.color}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/70 text-2xl">
                      <span aria-hidden>{c.emoji}</span>
                    </div>
                    <div>
                      <div className="text-sm md:text-base font-semibold text-gray-900">
                        {c.label}
                      </div>
                      <div className="mt-1 text-[13px] md:text-sm text-gray-800/90">
                        {c.description}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-[12px] md:text-sm text-gray-900">
                    <div className="min-w-0">
                      <div className="font-semibold leading-tight">
                        Recommended: {rec.title}
                      </div>
                      <div className="mt-0.5 text-[11px] md:text-xs text-gray-700 line-clamp-2">
                        {rec.sub}
                      </div>
                    </div>
                    <Image
                      src={encodeURI(recIcon)}
                      alt={rec.title}
                      width={34}
                      height={34}
                      className="ml-2 shrink-0 rounded-md"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Agents / Templates */}
        <section className="mx-auto mt-12 w-full max-w-5xl px-4">
          <div className="text-center mb-4">
            <h2 className="text-2xl font-bold text-white">Agents</h2>
            <p className="mt-1 text-sm text-slate-200">
              Each Zeta agent is tuned for a different part of your life.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-4">
            {(
              ['zeta build', 'zeta learn', 'zeta chef', 'zeta trainer'] as
              Template[]
            ).map((tpl) => {
              const icon = TEMPLATE_ICONS[tpl];
              const { title, sub } = TEMPLATE_DISPLAY[tpl];
              const traits = TEMPLATE_TRAITS[tpl];
              return (
                <div
                  key={tpl}
                  className="rounded-xl bg-white p-6 shadow hover:shadow-md"
                >
                  <Image
                    src={encodeURI(icon)}
                    alt={title}
                    width={96}
                    height={96}
                    className="mx-auto mb-3 rounded-lg"
                  />
                  <h3 className="text-center text-lg font-semibold text-gray-800">
                    {title}
                  </h3>
                  <p className="mt-1 text-center text-sm text-gray-600">
                    {sub}
                  </p>
                  <ul className="mt-3 grid grid-cols-1 gap-1 text-xs text-gray-700">
                    {traits.map((t) => (
                      <li
                        key={t}
                        className="mx-auto w-fit rounded-full border px-2 py-0.5"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* Browse Templates Button */}
        <div className="text-center mt-10">
          <button
            type="button"
            className="inline-block rounded-full bg-indigo-500 px-6 py-3 text-white font-medium hover:bg-indigo-600 transition"
          >
            Browse All Zeta Templates →
          </button>
        </div>

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
            <h2 className="text-3xl font-bold text-white mb-2">
              Zeta Premium
            </h2>
            <p className="text-slate-200 text-lg max-w-md">
              Unlock the full power of Pantheon — access more AI agents, deeper
              customization, higher limits, and exclusive premium tools. Premium
              gives you elite capabilities to turn ideas into outcomes faster,
              smarter, and with greater precision.
            </p>

            <ul className="mt-3 text-slate-100 text-sm space-y-1">
              <li>✅ Advanced memory & long-term context</li>
              <li>✅ Smarter notifications & initiative</li>
              <li>✅ More projects & higher limits</li>
              <li>✅ Deeper customization & control</li>
            </ul>

            <button
              type="button"
              className="mt-5 inline-block rounded-full bg-amber-500 px-6 py-3 text-white font-semibold hover:bg-amber-600 transition"
            >
              Upgrade to Premium
            </button>
          </div>
        </section>

        <footer className="mt-20 px-4 py-6 text-center text-sm text-slate-300">
          © {new Date().getFullYear()} Pantheon. All rights reserved.
        </footer>

        {/* 🔒 Overlay: any click anywhere sends to /login */}
        <div
          className="fixed inset-0 z-50 cursor-pointer"
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
  const { plan, username, selfDescription, avatarUrl, used, limit } =
    sessionInfo;
  const remaining = Math.max(0, limit - used);
  const avatarSrc = avatarUrl || DEFAULT_AVATAR_SRC;
  const progressPct = Math.min(
    100,
    Math.round((used / Math.max(1, limit)) * 100)
  );

  const TEMPLATE_ORDER: Template[] = [
    'zeta build',
    'zeta learn',
    'zeta engineer',
    'zeta writer',
    'zeta trainer',
    'zeta chef',
    'zeta motivation',
    'zeta quant',
  ];

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

      {/* What do you use AI for? (authed) */}
      <section className="mx-auto mt-10 w-full max-w-6xl px-4">
        <h2 className="text-xl font-semibold text-white text-center md:text-left">
          What do you use AI for?
        </h2>
        <p className="mt-1 text-xs text-slate-200 text-center md:text-left max-w-xl">
          Choose a tile to jump straight into creating a project with the right
          Zeta agent.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {USE_CASES.map((c) => {
            const rec = TEMPLATE_DISPLAY[c.recommendedTemplate];
            const recIcon = TEMPLATE_ICONS[c.recommendedTemplate];
            return (
              <Link
                key={c.key}
                href={c.href}
                className={`group relative flex h-full flex-col justify-between rounded-2xl p-4 text-left shadow-md ring-1 ring-black/10 transition transform hover:-translate-y-1 hover:shadow-lg ${c.color}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/70 text-xl mb-0.5">
                    <span aria-hidden>{c.emoji}</span>
                  </div>
                  <div>
                    <div className="text-sm md:text-base font-semibold text-gray-900">
                      {c.label}
                    </div>
                    <div className="mt-1 text-[12px] md:text-sm text-gray-900/90">
                      {c.description}
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between rounded-xl bg-white/70 px-3 py-2 text-[12px] md:text-sm text-gray-900">
                  <div className="min-w-0">
                    <div className="font-semibold leading-tight">
                      Recommended: {rec.title}
                    </div>
                    <div className="mt-0.5 text-[11px] md:text-xs text-gray-700 line-clamp-2">
                      {rec.sub}
                    </div>
                  </div>
                  <Image
                    src={encodeURI(recIcon)}
                    alt={rec.title}
                    width={26}
                    height={26}
                    className="ml-2 shrink-0 rounded-md"
                  />
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Agents / Templates grid */}
      <section className="mx-auto mt-10 w-full max-w-6xl px-4">
        <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
          <div>
            <h2 className="text-2xl font-bold text-white">Agents</h2>
            <p className="mt-1 text-sm text-slate-200">
              Your projects are grouped by Zeta agent so you can see where your
              time and progress lives.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
          {TEMPLATE_ORDER.map((tpl) => {
            const icon = TEMPLATE_ICONS[tpl];
            const { title, sub, href } = TEMPLATE_DISPLAY[tpl];
            const items = byTemplate[tpl] || [];
            const traits = TEMPLATE_TRAITS[tpl];
            return (
              <div
                key={tpl}
                className="rounded-2xl bg-white p-6 shadow ring-1 ring-black/5"
              >
                <div className="relative flex items-center justify-center">
                  <Image
                    src={encodeURI(icon)}
                    alt={title}
                    width={96}
                    height={96}
                    className="mb-3 rounded-lg"
                  />
                  <span className="absolute -left-2 -top-2 rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">
                    {items.length}
                  </span>
                </div>
                <h3 className="text-center text-lg font-semibold text-gray-800">
                  {title}
                </h3>
                <p className="mt-1 text-center text-xs text-gray-500">{sub}</p>

                {/* Traits */}
                <ul className="mt-3 grid grid-cols-1 gap-1 text-xs text-gray-700">
                  {traits.map((t) => (
                    <li
                      key={t}
                      className="mx-auto w-fit rounded-full border px-2 py-0.5"
                    >
                      {t}
                    </li>
                  ))}
                </ul>

                {/* Project list */}
                <ul className="mt-3 max-h-36 space-y-1 overflow-auto text-sm text-gray-700">
                  {items.length === 0 ? (
                    <li className="text-center text-gray-400">
                      No projects yet
                    </li>
                  ) : (
                    items.map((p) => (
                      <li
                        key={p.id}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate">• {p.name}</span>
                        {p.levelNum ? (
                          <span className="flex shrink-0 items-center gap-2">
                            <span className="rounded-full border border-indigo-200 bg-indigo-50 px-1.5 py-0.5 text-[10px] text-indigo-700">
                              Lv {p.levelNum}
                            </span>
                            <span className="whitespace-nowrap rounded-full border border-slate-300 px-1.5 py-0.5 text-[10px] text-slate-700">
                              {p.levelTitle ?? `Lv ${p.levelNum}`}
                            </span>
                          </span>
                        ) : null}
                      </li>
                    ))
                  )}
                </ul>

                <div className="mt-4 flex items-center justify-center">
                  <Link
                    href={href}
                    className="rounded-md bg-black px-3 py-1.5 text-xs text-white hover:bg-gray-800"
                  >
                    New {title.replace('Zeta ', '')} Project
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <footer className="mt-16 px-4 py-6 text-center text-sm text-slate-300">
        © {new Date().getFullYear()} Pantheon. All rights reserved.
      </footer>
    </main>
  );
}
