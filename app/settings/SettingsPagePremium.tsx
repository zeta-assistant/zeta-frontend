'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';

import { getPlanFromUser, PLAN_LIMIT, type Plan } from '@/lib/plan';
import ZetaPremiumMark, { PlanTag } from '@/components/ui/ZetaPremiumMark';

const DEFAULT_AVATAR_SRC = '/user-faceless.svg';

type AgentRow = { id: string; level: string; created_at: string; source: 'user_agents' | 'projects' };
type ProjectRow = { id: string; title: string | null; created_at: string };

type Frequency = 'hourly' | 'daily' | 'weekly' | 'monthly';
type TaskSettingsRow = { project_id: string; zeta_task_frequency: Frequency; user_task_frequency?: Frequency | null };

type IntegrationRow = {
  project_id: string;
  channel: 'telegram' | 'email' | 'webhook';
  is_enabled: boolean;
  updated_at?: string | null;
};

export default function SettingsPagePremium() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string>('');
  const [email, setEmail] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>('premium');
  const [limit, setLimit] = useState<number>(PLAN_LIMIT.premium);
  const [used, setUsed] = useState<number>(0);

  // profile
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [selfDescription, setSelfDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>('');
  const [avatarPreview, setAvatarPreview] = useState<string>(DEFAULT_AVATAR_SRC);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // agents
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentsLoading, setAgentsLoading] = useState<boolean>(true);

  // projects + per-project premium controls
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [taskSettings, setTaskSettings] = useState<Record<string, Frequency>>({});
  const [savingFreq, setSavingFreq] = useState<string | null>(null);

  // integrations
  const [integrations, setIntegrations] = useState<Record<string, Record<IntegrationRow['channel'], boolean>>>({});
  const [savingIntegration, setSavingIntegration] = useState<string | null>(null);

  // theme (premium)
  const [theme, setTheme] = useState<'standard' | 'midnight' | 'aurora' | 'amber'>('midnight');

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session ?? null;
      if (error || !session?.user) {
        router.replace('/login');
        return;
      }
      const u = session.user;
      const plan_ = getPlanFromUser(u);

// Also check projects table
const { data: projRows } = await supabase
  .from('user_projects')
  .select('plan, type')
  .eq('user_id', u.id);

const hasPremiumProject =
  Array.isArray(projRows) &&
  projRows.some((r: any) => {
    const v = String((r?.plan ?? r?.type ?? '')).toLowerCase();
    return v === 'premium';
  });

if (plan_ !== 'premium' && !hasPremiumProject) {
  router.replace('/settings'); // still free
  return;
}

      setUserId(u.id);
      setEmail(u.email ?? null);
      setPlan('premium');
      setLimit(PLAN_LIMIT.premium);

      // used project count
      const { count } = await supabase
        .from('user_projects')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', u.id);

      setUsed(count ?? 0);

      // profile fields
      setUsername(
        (u.user_metadata?.user_name as string) ||
          (u.user_metadata?.username as string) ||
          (u.email?.split('@')[0] as string) ||
          ''
      );
      setSelfDescription((u.user_metadata?.self_description as string) || '');

      const img = (u.user_metadata?.profile_image_url as string) || '';
      setAvatarUrl(img);
      setAvatarPreview(img || DEFAULT_AVATAR_SRC);

      // load agents/projects/controls
      await Promise.all([fetchAgents(u.id), fetchProjectsAndControls(u.id)]);

      setLoading(false);
    })();
  }, [router]);

  async function fetchAgents(uid: string) {
    setAgentsLoading(true);
    try {
      let rows: AgentRow[] = [];
      const ua = await supabase
        .from('user_agents')
        .select('id, level, created_at')
        .eq('user_id', uid)
        .order('created_at', { ascending: false });

      if (ua?.data && ua.data.length) {
        rows = ua.data.map((r: any) => ({
          id: r.id,
          level: r.level ?? 'standard',
          created_at: r.created_at,
          source: 'user_agents',
        }));
      } else {
        const up = await supabase
          .from('user_projects')
          .select('assistant_id, type, created_at')
          .eq('user_id', uid)
          .order('created_at', { ascending: false });

        const unique = new Map<string, AgentRow>();
        (up.data || []).forEach((p: any) => {
          const aid = p?.assistant_id;
          if (!aid) return;
          if (!unique.has(aid)) {
            unique.set(aid, {
              id: aid,
              level: p?.type || 'standard',
              created_at: p?.created_at || new Date().toISOString(),
              source: 'projects',
            });
          }
        });
        rows = Array.from(unique.values());
      }

      setAgents(rows);
    } catch {
      setAgents([]);
    } finally {
      setAgentsLoading(false);
    }
  }

  async function fetchProjectsAndControls(uid: string) {
    const { data: projs } = await supabase
      .from('user_projects')
      .select('id, title, created_at')
      .eq('user_id', uid)
      .order('created_at', { ascending: false });

    const list = (projs || []).map(p => ({
      id: p.id,
      title: p.title ?? 'Untitled Project',
      created_at: p.created_at,
    })) as ProjectRow[];

    setProjects(list);

    if (list.length) {
      const ids = list.map(p => p.id);
      const { data: ts } = await supabase
        .from('task_settings')
        .select('project_id, zeta_task_frequency, user_task_frequency')
        .in('project_id', ids);

      const merged: Record<string, Frequency> = {};
      list.forEach(p => {
        const row = (ts || []).find(r => r.project_id === p.id) as TaskSettingsRow | undefined;
        merged[p.id] = (row?.zeta_task_frequency || 'daily') as Frequency;
      });
      setTaskSettings(merged);
    }

    // optional integrations table
    try {
      if (list.length) {
        const ids = list.map(p => p.id);
        const { data: ints } = await supabase
          .from('project_integrations')
          .select('project_id, channel, is_enabled')
          .in('project_id', ids);

        const byProj: Record<string, Record<IntegrationRow['channel'], boolean>> = {};
        list.forEach(p => (byProj[p.id] = { telegram: false, email: false, webhook: false }));
        (ints || []).forEach((r: any) => {
          if (!byProj[r.project_id]) byProj[r.project_id] = { telegram: false, email: false, webhook: false };
          byProj[r.project_id][r.channel as IntegrationRow['channel']] = !!r.is_enabled;
        });
        setIntegrations(byProj);
      }
    } catch {
      // table not present or RLS; ignore
    }
  }

  const usernameValid = useMemo(() => /^[a-z0-9_]{2,15}$/.test(username), [username]);

  function validateUsernameLocal() {
    if (!username) return setUsernameError('Username is required.');
    if (username.length < 2 || username.length > 15) return setUsernameError('Username must be 2–15 characters.');
    if (!/^[a-z0-9_]+$/.test(username)) return setUsernameError('Only lowercase letters, numbers, and underscore.');
    setUsernameError(null);
  }

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    if (!file.type.startsWith('image/')) return alert('Please select an image file.');
    if (file.size > 5 * 1024 * 1024) return alert('Image too large (max 5MB).');

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
      const filePath = `${userId}/${Date.now()}.${fileExt}`;
      const { error: upErr } = await supabase.storage.from('profile-photos').upload(filePath, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('profile-photos').getPublicUrl(filePath);
      const publicUrl = pub?.publicUrl || '';
      setAvatarUrl(publicUrl);
      setAvatarPreview(publicUrl || DEFAULT_AVATAR_SRC);
    } catch (err: any) {
      console.error('Upload failed', err);
      alert(`Failed to upload image: ${err?.message || err}`);
    } finally {
      setUploading(false);
    }
  }

  async function saveProfile() {
    validateUsernameLocal();
    if (usernameError) return;
    if (!usernameValid) return;

    setSaving(true);
    try {
      const normalized = username.toLowerCase();
      const res = await fetch('/api/profile/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: normalized,
          self_description: selfDescription,
          profile_image_url: avatarUrl || null,
          theme, // store chosen premium theme
        }),
      });
      const json = await res.json();
      if (!res.ok || !json?.ok) throw new Error(json?.error || 'Failed to save');
      alert('Profile saved!');
    } catch (err: any) {
      alert(err?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function saveFrequency(projectId: string, freq: Frequency) {
    setSavingFreq(projectId);
    try {
      const { error } = await supabase
        .from('task_settings')
        .upsert(
          {
            project_id: projectId,
            zeta_task_frequency: freq,
          } as TaskSettingsRow,
          { onConflict: 'project_id' }
        );
      if (error) throw error;
      setTaskSettings(prev => ({ ...prev, [projectId]: freq }));
    } catch (e: any) {
      alert(`Failed to save frequency: ${e?.message || e}`);
    } finally {
      setSavingFreq(null);
    }
  }

  async function toggleIntegration(projectId: string, channel: IntegrationRow['channel']) {
    setSavingIntegration(`${projectId}:${channel}`);
    try {
      const current = !!integrations[projectId]?.[channel];
      const next = !current;

      await supabase
        .from('project_integrations')
        .upsert(
          { project_id: projectId, channel, is_enabled: next } as IntegrationRow,
          { onConflict: 'project_id,channel' }
        );

      setIntegrations(prev => ({
        ...prev,
        [projectId]: { ...(prev[projectId] || { telegram: false, email: false, webhook: false }), [channel]: next },
      }));
    } catch (e: any) {
      console.warn('Integration toggle failed (maybe table missing or RLS)', e);
      alert('Could not save integration. Check `project_integrations` table & RLS.');
    } finally {
      setSavingIntegration(null);
    }
  }

  const handleBilling = () => router.push('/billing');

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1226] text-white px-6 py-10">
        <div className="max-w-5xl mx-auto text-white/70">Loading premium settings…</div>
      </div>
    );
  }

  const remaining = Math.max(0, limit - used);

  return (
    <div className="min-h-screen bg-[#0b1226]">
      {/* HERO */}
      <div className="relative border-b border-white/10 bg-gradient-to-b from-[#0a0f25] via-[#0b1226] to-[#0f1835]">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(1200px 400px at 10% -10%, rgba(245,158,11,0.12), rgba(0,0,0,0)), radial-gradient(1000px 300px at 80% -20%, rgba(168,85,247,0.10), rgba(0,0,0,0))',
          }}
        />
        <div className="relative max-w-5xl mx-auto px-6 py-8 flex items-center gap-6 text-white">
          <ZetaPremiumMark plan="premium" size={104} srcPremium="/zeta-premium.png" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-white">User Settings</h1>
              <PlanTag plan="premium" onClick={handleBilling} />
            </div>
            <p className="text-sm text-white/80 mt-1">
              Projects used: <span className="font-mono">{used}</span> / {limit}{' '}
              {remaining === 0 ? (
                <span className="ml-2 text-amber-300 font-medium">Limit reached</span>
              ) : (
                <span className="ml-2 text-emerald-300 font-medium">{remaining} remaining</span>
              )}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/projects')}
              className="text-sm px-3 py-2 rounded-md border border-white/20 bg-white/10 hover:bg-white/15 text-white"
            >
              ← Back to Projects
            </button>
            <button
              onClick={handleBilling}
              className="text-sm px-4 py-2 rounded-md shadow bg-white/20 text-white hover:bg-white/30"
            >
              Manage Billing
            </button>
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-lg font-semibold mb-3">Profile</h2>

          {/* Avatar */}
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Premium avatar</label>
            <div className="w-full h-36 sm:h-44 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarPreview || DEFAULT_AVATAR_SRC}
                alt="Profile"
                className="w-full h-full object-contain"
                onError={(e) => { (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR_SRC; }}
              />
            </div>
            <div className="mt-2 flex items-center gap-3">
              <label className="inline-block">
                <span className="sr-only">Choose photo</span>
                <input type="file" accept="image/*" onChange={handleImageChange} className="block text-xs" disabled={uploading} />
              </label>
              {uploading && <div className="text-[11px] text-gray-500">Uploading…</div>}
              {avatarUrl && (
                <button
                  type="button"
                  className="text-[11px] text-gray-600 underline"
                  onClick={() => { setAvatarUrl(''); setAvatarPreview(DEFAULT_AVATAR_SRC); }}
                >
                  Use default avatar
                </button>
              )}
            </div>
          </div>

          {/* Username */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">Username (unique)</label>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              onBlur={validateUsernameLocal}
              className={['w-full border rounded-md px-3 py-2 text-sm', usernameError ? 'border-red-400' : 'border-gray-300'].join(' ')}
              placeholder="e.g. maker_ai"
              maxLength={15}
            />
            <div className="mt-1 text-[11px] text-gray-500">
              2–15 chars, only <code>a–z</code>, <code>0–9</code>, and <code>_</code>.
            </div>
            {usernameError && <div className="text-[11px] text-red-600 mt-1">{usernameError}</div>}
          </div>

          {/* Self-description */}
          <div className="mb-3">
            <label className="block text-xs text-gray-500 mb-1">About you</label>
            <textarea
              value={selfDescription}
              onChange={(e) => setSelfDescription(e.target.value)}
              className="w-full border rounded-md px-3 py-2 text-sm min-h-[120px]"
              placeholder={`What are your goals over the next 3–6 months?\nWhat skills or domains interest you most?\nWhat would you like Zeta to help you automate or accelerate?`}
            />
            <div className="mt-1 text-[11px] text-gray-500">
              Premium gives you smarter defaults & priority support — tell Zeta where to focus.
            </div>
          </div>

          {/* Theme (Premium) */}
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Theme (Premium)</label>
            <div className="grid grid-cols-2 gap-2">
              {(['midnight', 'aurora', 'amber', 'standard'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTheme(t)}
                  className={[
                    'rounded-lg border px-3 py-2 text-sm',
                    theme === t ? 'border-amber-400 ring-2 ring-amber-200' : 'border-gray-200 hover:border-gray-300',
                  ].join(' ')}
                >
                  {t === 'midnight' && '🌌 Midnight'}
                  {t === 'aurora' && '🎐 Aurora'}
                  {t === 'amber' && '🟡 Amber'}
                  {t === 'standard' && '⚪ Standard'}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={saveProfile}
            disabled={saving || uploading}
            className={['text-sm px-4 py-2 rounded-md', saving || uploading ? 'bg-gray-300 text-gray-700' : 'bg-amber-600 hover:bg-amber-700 text-white'].join(' ')}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* Premium Controls */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Premium Controls</h2>
            <div className="text-xs text-amber-700 font-medium">👑 Premium Active</div>
          </div>

          {/* Task Frequency per Project */}
          <div className="mb-5">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Task Automation Frequency</h3>
              <div className="text-xs text-gray-500">Calls <code>generate-daily-tasks</code> on schedule</div>
            </div>
            <div className="mt-2 rounded-xl border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="text-left p-3">Project</th>
                    <th className="text-left p-3">Created</th>
                    <th className="text-right p-3">Frequency</th>
                  </tr>
                </thead>
                <tbody>
                  {projects.length === 0 ? (
                    <tr><td className="p-3 text-gray-500" colSpan={3}>No projects yet.</td></tr>
                  ) : (
                    projects.map(p => (
                      <tr key={p.id} className="border-t">
                        <td className="p-3">{p.title || 'Untitled Project'}</td>
                        <td className="p-3">{new Date(p.created_at).toLocaleString()}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-2">
                            {(['hourly', 'daily', 'weekly', 'monthly'] as Frequency[]).map(f => {
                              const selected = taskSettings[p.id] === f;
                              const busy = savingFreq === p.id;
                              return (
                                <button
                                  key={f}
                                  disabled={busy}
                                  onClick={() => saveFrequency(p.id, f)}
                                  className={[
                                    'px-2.5 py-1 rounded-full border text-xs',
                                    selected ? 'border-amber-400 text-amber-700 bg-amber-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50',
                                    busy ? 'opacity-60 cursor-wait' : '',
                                  ].join(' ')}
                                  title={f}
                                >
                                  {f}
                                </button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Changing the frequency updates your project’s schedule. Your edge function <code>supabase/functions/generate-daily-tasks</code> will be triggered on the selected cadence.
            </p>
          </div>

          {/* Integrations */}
          <div className="mb-5">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Integrations</h3>
              <div className="text-xs text-gray-500">Telegram · Email · Webhook</div>
            </div>
            <div className="mt-2 space-y-2">
              {projects.map(p => (
                <div key={p.id} className="rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{p.title || 'Untitled Project'}</div>
                    <div className="text-xs text-gray-500">Project ID: <span className="font-mono">{p.id}</span></div>
                  </div>
                  <div className="flex items-center gap-2">
                    {(['telegram', 'email', 'webhook'] as const).map(ch => {
                      const on = !!integrations[p.id]?.[ch];
                      const busy = savingIntegration === `${p.id}:${ch}`;
                      return (
                        <button
                          key={ch}
                          disabled={busy}
                          onClick={() => toggleIntegration(p.id, ch)}
                          className={[
                            'px-2.5 py-1 rounded-full border text-xs',
                            on ? 'border-emerald-400 text-emerald-700 bg-emerald-50' : 'border-gray-300 text-gray-700 hover:bg-gray-50',
                            busy ? 'opacity-60 cursor-wait' : '',
                          ].join(' ')}
                          title={ch}
                        >
                          {on ? 'On' : 'Off'} · {ch}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              {projects.length === 0 && <div className="text-sm text-gray-500">Create a project to enable integrations.</div>}
            </div>
          </div>

          {/* Perks blurb */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-amber-900">Premium Perks</div>
                <div className="text-sm text-amber-800">
                  Capacity boost, advanced automations, priority support, and early access features.
                </div>
              </div>
              <button
                onClick={handleBilling}
                className="text-xs px-3 py-1.5 rounded-md border border-amber-300 bg-white text-amber-700 hover:bg-amber-100"
              >
                Manage Billing
              </button>
            </div>
          </div>
        </div>

        {/* Agents */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Agents</h2>
            {!agentsLoading && <span className="text-xs text-gray-500">{agents.length} total</span>}
          </div>
          {agentsLoading ? (
            <div className="text-gray-500 text-sm">Loading agents…</div>
          ) : agents.length === 0 ? (
            <div className="text-gray-600 text-sm">You don’t have any agents yet. Create a project to spin one up.</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-700">
                  <tr>
                    <th className="text-left p-3">Agent ID</th>
                    <th className="text-left p-3">Level</th>
                    <th className="text-left p-3">Created</th>
                    <th className="text-right p-3">Source</th>
                  </tr>
                </thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id} className="border-t">
                      <td className="p-3 font-mono text-xs break-all">{a.id}</td>
                      <td className="p-3">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs border border-indigo-300 text-indigo-700 bg-indigo-50">
                          {a.level || 'standard'}
                        </span>
                      </td>
                      <td className="p-3">{new Date(a.created_at).toLocaleString()}</td>
                      <td className="p-3 text-right text-gray-500">{a.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Premium Summary */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Why stay Premium?</h2>
              <p className="text-sm text-gray-600 mt-1">Higher limits, faster iteration, more automation.</p>
            </div>
            <div className="flex items-center gap-3">
              <Image src="/zeta-premium.png" alt="Zeta Premium" width={56} height={56} className="rounded-xl" />
              <PlanPrice plan="premium" />
            </div>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-sm">
            <Benefit icon="⚡" title="Capacity Boost" desc={`Projects up to ${PLAN_LIMIT.premium}.`} />
            <Benefit icon="🔁" title="Automation Cadence" desc="Hourly/Daily/Weekly/Monthly task generation." />
            <Benefit icon="🎧" title="Priority Support" desc="Jump to the front of the queue." />
            <Benefit icon="🧪" title="Early Access" desc="Try new features & betas first." />
          </ul>
        </div>
      </div>
    </div>
  );
}

/* helpers (reused) */
function PlanPrice({ plan }: { plan: Plan }) {
  return (
    <div className="text-right">
      {plan === 'premium' ? (
        <div className="text-sm">
          <div className="font-semibold text-amber-700">Premium</div>
          <div className="text-gray-500">Active</div>
        </div>
      ) : (
        <div className="text-sm">
          <div className="font-semibold">
            Premium · <span className="text-amber-600">$30/mo</span>
          </div>
          <div className="text-gray-500">or $300/yr (save 17%)</div>
        </div>
      )}
    </div>
  );
}

function Benefit({ icon, title, desc }: { icon: string; title: string; desc: string }) {
  return (
    <li className="flex items-start gap-3 border rounded-lg p-3">
      <div className="text-lg leading-none">{icon}</div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-gray-600">{desc}</div>
      </div>
    </li>
  );
}
