'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Image from 'next/image';

import { getPlanFromUser, PLAN_LIMIT, type Plan } from '@/lib/plan';
import ZetaPremiumMark, { PlanTag } from '@/components/ui/ZetaPremiumMark';

const DEFAULT_AVATAR_SRC = '/user-faceless.svg';

type AgentRow = {
  id: string;
  level: string;
  created_at: string;
  source: 'user_agents' | 'projects';
};

export default function SettingsPageFree() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  const [userId, setUserId] = useState<string>('');
  const [email, setEmail] = useState<string | null>(null);
  const [plan, setPlan] = useState<Plan>('free');
  const [limit, setLimit] = useState<number>(PLAN_LIMIT.free);
  const [used, setUsed] = useState<number>(0);

  // profile fields
  const [username, setUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [selfDescription, setSelfDescription] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string>(''); // saved value (public URL or '')
  const [avatarPreview, setAvatarPreview] = useState<string>(''); // preview or default
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // agents
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [agentsLoading, setAgentsLoading] = useState<boolean>(true);

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
      setUserId(u.id);
      setEmail(u.email ?? null);
      setPlan(plan_);
      setLimit(PLAN_LIMIT[plan_]);

      const { count } = await supabase
        .from('user_projects')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', u.id);
      setUsed(count ?? 0);

      setUsername(
        (u.user_metadata?.user_name as string) ||
          (u.user_metadata?.username as string) ||
          (u.email?.split('@')[0] as string) ||
          ''
      );
      setSelfDescription((u.user_metadata?.self_description as string) || '');

      const img = (u.user_metadata?.profile_image_url as string) || '';
      const startUrl = img || DEFAULT_AVATAR_SRC;
      setAvatarUrl(img);
      setAvatarPreview(startUrl);
      setLoading(false);

      await fetchAgents(u.id);
    })();
  }, [router]);

  // Try user_agents first, then derive from user_projects
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
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('Image too large (max 5MB).');
      return;
    }
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'png';
      const filePath = `${userId}/${Date.now()}.${fileExt}`;
      const { error: upErr } = await supabase.storage.from('profile-photos').upload(filePath, file, { upsert: true });
      if (upErr) throw upErr;

      const { data: pub } = supabase.storage.from('profile-photos').getPublicUrl(filePath);
      const publicUrl = pub?.publicUrl || '';
      setAvatarUrl(publicUrl);
      setAvatarPreview(publicUrl);
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

  const handleUpgrade = () => {
    if (plan === 'premium') router.push('/billing');
    else router.push('/upgrade');
  };

  const PlanBadge = useMemo(
    () =>
      function Badge() {
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
    [plan]
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0b1226] text-white px-6 py-10">
        <div className="max-w-5xl mx-auto text-white/70">Loading settings…</div>
      </div>
    );
  }

  const remaining = Math.max(0, limit - used);

  return (
    <div className="min-h-screen bg-[#0b1226]">
      {/* HERO — darker blue gradient */}
      <div className="relative border-b border-white/10 bg-gradient-to-b from-indigo-950 via-indigo-900 to-indigo-800">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(1200px 400px at 10% -10%, rgba(59,130,246,0.20), rgba(0,0,0,0)), radial-gradient(1000px 300px at 80% -20%, rgba(16,185,129,0.10), rgba(0,0,0,0))',
          }}
        />
        <div className="relative max-w-5xl mx-auto px-6 py-8 flex items-center gap-6 text-white">
          {/* shared ZetaPremiumMark (with base avatar override) */}
          <ZetaPremiumMark plan={plan} size={104} srcFree="/pantheon.png" srcPremium="/zeta-premium.png" />
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold text-white">User Settings</h1>
              <PlanTag plan={plan} onClick={() => router.push(plan === 'premium' ? '/billing' : '/upgrade')} />
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
              onClick={handleUpgrade}
              className={[
                'text-sm px-4 py-2 rounded-md shadow',
                plan === 'premium' ? 'bg-white/20 text-white' : 'bg-amber-500 text-white hover:bg-amber-600',
              ].join(' ')}
            >
              {plan === 'premium' ? 'Manage Billing' : 'Upgrade to Premium'}
            </button>
          </div>
        </div>
      </div>

      {/* PAGE CONTENT */}
      <div className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Profile */}
        <div className="lg:col-span-1 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="text-lg font-semibold mb-3">Profile</h2>

          {/* Avatar (wide, contain) */}
          <div className="mb-4">
            <label className="block text-xs text-gray-500 mb-1">Profile picture</label>
            <div className="w-full h-36 sm:h-44 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarPreview || DEFAULT_AVATAR_SRC}
                alt="Profile"
                className="w-full h-full object-contain"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = DEFAULT_AVATAR_SRC;
                }}
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
                  onClick={() => {
                    setAvatarUrl('');
                    setAvatarPreview(DEFAULT_AVATAR_SRC);
                  }}
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
              placeholder={`What are your goals over the next 3–6 months?
What skills or domains interest you most?
What would you like Zeta to help you automate or accelerate?`}
            />
            <div className="mt-1 text-[11px] text-gray-500">
              Share goals, interests, and where Zeta should plug in — I’ll use this for smarter defaults.
            </div>
          </div>

          <button
            onClick={saveProfile}
            disabled={saving || uploading}
            className={['text-sm px-4 py-2 rounded-md', saving || uploading ? 'bg-gray-300 text-gray-700' : 'bg-blue-600 hover:bg-blue-700 text-white'].join(' ')}
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>

        {/* Agents */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
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

        {/* Premium (full width below) */}
        <div className="lg:col-span-3 bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Why go Premium?</h2>
              <p className="text-sm text-gray-600 mt-1">Unlock higher capacity and power features that level up your workflow.</p>
            </div>
            <div className="flex items-center gap-3">
              <Image src="/zeta-premium.png" alt="Zeta Premium" width={56} height={56} className="rounded-xl" />
              <PlanPrice plan={plan} />
            </div>
          </div>

          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 text-sm">
            <Benefit icon="⚡" title="Capacity Boost" desc={`Increase project limit from ${PLAN_LIMIT.free} → ${PLAN_LIMIT.premium}.`} />
            <Benefit icon="🧪" title="Early Access" desc="Try new features & betas first." />
            <Benefit icon="🎧" title="Priority Support" desc="Jump to the front of the queue." />
            <Benefit icon="🔌" title="Advanced Automations" desc="Extra integrations & API slots." />
          </ul>

          <div className="mt-6 overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="text-left p-3">Feature</th>
                  <th className="text-center p-3">Free</th>
                  <th className="text-center p-3">Premium</th>
                </tr>
              </thead>
              <tbody>
                <Row label="Projects" free={`${PLAN_LIMIT.free}`} pro={`${PLAN_LIMIT.premium}`} />
                <Row label="New feature access" free="Standard" pro="Early access" />
                <Row label="Support queue" free="Standard" pro="Priority" />
                <Row label="Automations & integrations" free="Basic" pro="Advanced + more channels" />
                <Row label="Theme & avatar" free="Standard" pro="Premium avatar & themes" />
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={handleUpgrade}
              className={[
                'text-sm px-5 py-2 rounded-md shadow',
                plan === 'premium' ? 'bg-gray-200 text-gray-700 cursor-pointer' : 'bg-amber-500 text-white hover:bg-amber-600',
              ].join(' ')}
            >
              {plan === 'premium' ? 'Manage Billing' : 'Upgrade to Premium'}
            </button>
            <span className="text-xs text-gray-500">Cancel anytime. Annual plans save more.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* helpers */
function PlanPrice({ plan }: { plan: Plan }) {
  const isPremium = plan === 'premium';
  return (
    <div className="text-right">
      {isPremium ? (
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

function Row({ label, free, pro }: { label: string; free: string; pro: string }) {
  return (
    <tr className="border-t">
      <td className="p-3">{label}</td>
      <td className="p-3 text-center text-gray-700">{free}</td>
      <td className="p-3 text-center font-semibold text-amber-700">{pro}</td>
    </tr>
  );
}
