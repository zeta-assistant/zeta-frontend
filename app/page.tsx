'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import Header from '@/components/Header';
import { supabase } from '@/lib/supabaseClient';
import { getPlanFromUser, PLAN_LIMIT, type Plan } from '@/lib/plan';
import { PlanTag } from '@/components/ui/ZetaPremiumMark';

// Optional XP utils. If not present, we fall back gracefully.
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
  agent: 'zeta' | 'theta' | 'delta' | 'unknown';
  levelNum?: number;
  levelTitle?: string;
};

/* ========================= Helpers ========================= */

const DEFAULT_AVATAR_SRC = '/user-faceless.svg';

function normStr(v: any): string {
  return (v ?? '').toString().trim();
}

function normalizeAgentFromAny(row: ProjectRowRaw): Project['agent'] {
  const candidates = [
    row.assistant_type,
    row.agent,
    row.agent_type,
    row.agentName,
    row.agent_kind,
    row.assistant,
    row.assistant_label,
    row.assistant_slug,
    row.type,
    row.project_type,
    row.primary_agent,
  ]
    .map(normStr)
    .filter(Boolean);

  const allStrings = Object.values(row)
    .filter((v) => typeof v === 'string')
    .map(normStr);

  const haystack = (candidates.length ? candidates : allStrings).join(' | ').toLowerCase();

  if (/\bzeta\b/.test(haystack)) return 'zeta';
  if (/\btheta\b/.test(haystack)) return 'theta';
  if (/\bdelta\b/.test(haystack)) return 'delta';
  return 'zeta'; // default for today
}

// Lightweight fallback in case XP utils aren't available
const fallbackLevelFromXP = (xp: number) => Math.max(1, Math.min(10, Math.floor(xp / 100) + 1));
const fallbackTitleFromLevel = (lvl: number) => `Lv ${lvl}`;

function getProjectLevel(row: ProjectRowRaw): { levelNum: number; levelTitle: string } | null {
  const direct = Number(row.level ?? row.project_level ?? row.lvl ?? Number.NaN);
  if (Number.isFinite(direct) && direct > 0) {
    const title = LEVELS?.find((l) => l.level === direct)?.title ?? `Lv ${direct}`;
    return { levelNum: direct, levelTitle: title };
  }
  const xp = Number(row.xp ?? row.total_xp ?? row.project_xp ?? Number.NaN);
  if (Number.isFinite(xp) && xp >= 0) {
    if (typeof getXPProgress === 'function') {
      try {
        const gp: any = getXPProgress(xp);
        const levelNum = gp?.level ?? gp?.currentLevel ?? gp?.levelNumber ?? 1;
        const title = LEVELS?.find((l) => l.level === levelNum)?.title ?? `Lv ${levelNum}`;
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
    normStr(row.id) || (typeof crypto !== 'undefined' ? crypto.randomUUID() : `tmp_${Date.now()}`);
  const name =
    normStr(row.name) ||
    normStr(row.title) ||
    normStr(row.project_name) ||
    normStr(row.projectTitle) ||
    'Untitled';
  const agent = normalizeAgentFromAny(row);
  const lvl = getProjectLevel(row);
  return { id, name, agent, ...(lvl ?? {}) };
}

/* ========================= Page ========================= */

export default function HomePage() {
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

  // group by agent
  const byAgent = useMemo(() => {
    const base = { zeta: [] as Project[], theta: [] as Project[], delta: [] as Project[], unknown: [] as Project[] };
    for (const p of projects) (base[p.agent] || base.unknown).push(p);
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
      <main className="relative min-h-screen overflow-hidden">
        {/* Pantheon blue background (layered radial gradients) */}
        <div
          className="absolute inset-0 -z-10"
          style={{
            background:
              'radial-gradient(1200px 600px at -10% -10%, rgba(59,130,246,0.25), transparent 60%),' +
              'radial-gradient(900px 500px at 110% 0%, rgba(79,70,229,0.22), transparent 60%),' +
              'radial-gradient(800px 500px at 50% 110%, rgba(99,102,241,0.20), transparent 60%),' +
              'linear-gradient(to bottom, #eff6ff 0%, #e0e7ff 45%, #eef2ff 100%)',
          }}
        />

        {/* Responsive Header */}
        <Header authed={false} />

        {/* Hero */}
        <section className="mx-auto w-full max-w-6xl px-4 mt-10 text-center">
          <h1 className="text-4xl md:text-5xl font-extrabold text-gray-900">
            Pantheon <span className="text-indigo-600">Personal Superintelligence</span>
          </h1>
          <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
            Not just another chatbot. Pantheon adds memory, initiative, notifications,
            files, goals & tasks — and works with any model (including custom).
          </p>
        </section>

        {/* Agent tiles (static on logged-out) */}
        <section className="mx-auto mt-12 grid w-full max-w-5xl grid-cols-1 gap-6 px-4 sm:grid-cols-3">
          <div className="rounded-xl bg-white p-6 shadow hover:shadow-md">
            <Image src="/framed-agents/zeta-framed.png" alt="Zeta framed" width={96} height={96} className="mx-auto mb-3 rounded-lg" />
            <h3 className="text-center text-lg font-semibold text-gray-800">Build with Zeta</h3>
            <p className="mt-2 text-center text-sm text-gray-600">
              Organize, plan, and achieve your goals. Build timelines, custom notifications,
              and track projects across work, side hustles, and hobbies.
            </p>
          </div>

          <div className="relative rounded-xl bg-white p-6 shadow hover:shadow-md">
            <span className="absolute right-2 top-2 rounded-md bg-yellow-300 px-2 py-0.5 text-xs">Coming soon</span>
            <Image src="/framed-agents/theta-framed.png" alt="Theta framed" width={96} height={96} className="mx-auto mb-3 rounded-lg" />
            <h3 className="text-center text-lg font-semibold text-gray-800">Learn with Theta</h3>
          </div>

          <div className="relative rounded-xl bg-white p-6 shadow hover:shadow-md">
            <span className="absolute right-2 top-2 rounded-md bg-yellow-300 px-2 py-0.5 text-xs">Coming soon</span>
            <Image src="/framed-agents/delta-framed.png" alt="Delta framed" width={96} height={96} className="mx-auto mb-3 rounded-lg" />
            <h3 className="text-center text-lg font-semibold text-gray-800">Grow with Delta</h3>
          </div>
        </section>

        {/* Zeta Premium */}
        <section className="mx-auto mt-16 max-w-3xl px-4 text-center">
          <Image src="/zeta-premium.png" alt="Zeta Premium" width={180} height={180} className="mx-auto" />
          <h2 className="mt-6 text-2xl font-bold text-gray-800">Zeta Premium</h2>
          <p className="mt-2 text-gray-600">
            Unlock more features, deeper customization, and advanced tools designed
            to supercharge your projects and personal growth.
          </p>
        </section>

        <footer className="mt-20 px-4 py-6 text-center text-sm text-gray-500">
          © {new Date().getFullYear()} Pantheon. All rights reserved.
        </footer>
      </main>
    );
  }

  /* ===================== Logged-IN Home ===================== */
  const { plan, username, selfDescription, avatarUrl, used, limit } = sessionInfo;
  const remaining = Math.max(0, limit - used);
  const avatarSrc = avatarUrl || DEFAULT_AVATAR_SRC;
  const progressPct = Math.min(100, Math.round((used / Math.max(1, limit)) * 100));

  return (
    <main className="relative min-h-screen overflow-hidden">
      {/* Pantheon blue background (layered radial gradients) */}
      <div
        className="absolute inset-0 -z-10"
        style={{
          background:
            'radial-gradient(1200px 600px at -10% -10%, rgba(59,130,246,0.25), transparent 60%),' +
            'radial-gradient(900px 500px at 110% 0%, rgba(79,70,229,0.22), transparent 60%),' +
            'radial-gradient(800px 500px at 50% 110%, rgba(99,102,241,0.20), transparent 60%),' +
            'linear-gradient(to bottom, #eff6ff 0%, #e0e7ff 45%, #eef2ff 100%)',
        }}
      />

      {/* Responsive Header (logged-in) */}
      <Header
        authed
        avatarUrl={avatarSrc}
        planPill={<PlanTag plan={plan} />}
        onLogout={async () => {
          await supabase.auth.signOut();
          window.location.assign('/');
        }}
      />

      {/* Account summary (no quick actions) */}
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
                <h2 className="truncate text-xl font-semibold text-gray-900">{username || 'User'}</h2>
                {/* Keep the local PlanBadge for the profile card */}
                <PlanBadge plan={plan} />
              </div>
              <p className="mt-1 line-clamp-3 text-sm text-gray-600">
                {selfDescription || 'Tell Zeta about your goals in Settings → Profile.'}
              </p>
              <div className="mt-3 flex gap-2">
                <Link href="/settings" className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                  Edit profile
                </Link>
                <Link href="/projects" className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs text-white hover:bg-indigo-500">
                  Open Projects
                </Link>
              </div>
            </div>
          </div>

          {/* Usage */}
          <div className="col-span-1">
            <div className="text-sm font-medium text-gray-700">Projects</div>
            <div className="mt-1 text-3xl font-extrabold text-gray-900">
              {used} <span className="text-base font-medium text-gray-500">/ {limit}</span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-200">
              <div className="h-2 bg-indigo-500" style={{ width: `${progressPct}%` }} />
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {remaining === 0 ? 'Limit reached' : `${remaining} remaining`}
            </div>
            <div className="mt-3 flex gap-2">
              <Link href="/onboarding" className="rounded-md bg-black px-3 py-1.5 text-xs text-white hover:bg-gray-800">
                + New Project
              </Link>
              <Link href="/upgrade" className="rounded-md border px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                {plan === 'premium' ? 'Manage Billing' : 'Upgrade'}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Agent tiles with counters (top-left) + project lists with level pills */}
      <section className="mx-auto mt-10 grid w-full max-w-5xl grid-cols-1 gap-6 px-4 sm:grid-cols-3">
        {/* Zeta */}
        <div className="rounded-xl bg-white p-6 shadow">
          <div className="relative flex items-center justify-center">
            <Image src="/framed-agents/zeta-framed.png" alt="Zeta framed" width={96} height={96} className="mb-3 rounded-lg" />
            <span className="absolute -left-2 -top-2 rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">
              {byAgent.zeta.length}
            </span>
          </div>
          <h3 className="text-center text-lg font-semibold text-gray-800">Build with Zeta</h3>
          <ul className="mt-3 max-h-28 space-y-1 overflow-auto text-sm text-gray-700">
            {byAgent.zeta.length === 0 ? (
              <li className="text-center text-gray-400">No Zeta projects yet</li>
            ) : (
              byAgent.zeta.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
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
        </div>

        {/* Theta */}
        <div className="relative rounded-xl bg-white p-6 shadow">
          <span className="absolute right-2 top-2 rounded-md bg-yellow-300 px-2 py-0.5 text-xs">Coming soon</span>
          <div className="relative flex items-center justify-center">
            <Image src="/framed-agents/theta-framed.png" alt="Theta framed" width={96} height={96} className="mb-3 rounded-lg" />
            <span className="absolute -left-2 -top-2 rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">
              {byAgent.theta.length}
            </span>
          </div>
          <h3 className="text-center text-lg font-semibold text-gray-800">Learn with Theta</h3>
          <ul className="mt-3 max-h-28 space-y-1 overflow-auto text-sm text-gray-700">
            {byAgent.theta.length === 0 ? (
              <li className="text-center text-gray-400">No Theta projects yet</li>
            ) : (
              byAgent.theta.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
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
        </div>

        {/* Delta */}
        <div className="relative rounded-xl bg-white p-6 shadow">
          <span className="absolute right-2 top-2 rounded-md bg-yellow-300 px-2 py-0.5 text-xs">Coming soon</span>
          <div className="relative flex items-center justify-center">
            <Image src="/framed-agents/delta-framed.png" alt="Delta framed" width={96} height={96} className="mb-3 rounded-lg" />
            <span className="absolute -left-2 -top-2 rounded-full bg-indigo-600 px-2 py-0.5 text-xs text-white">
              {byAgent.delta.length}
            </span>
          </div>
          <h3 className="text-center text-lg font-semibold text-gray-800">Grow with Delta</h3>
          <ul className="mt-3 max-h-28 space-y-1 overflow-auto text-sm text-gray-700">
            {byAgent.delta.length === 0 ? (
              <li className="text-center text-gray-400">No Delta projects yet</li>
            ) : (
              byAgent.delta.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2">
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
        </div>
      </section>

      <footer className="mt-16 px-4 py-6 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} Pantheon. All rights reserved.
      </footer>
    </main>
  );
}
