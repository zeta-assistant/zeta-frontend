'use client';

import Image from 'next/image';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@supabase/auth-helpers-react';
import { supabase } from '@/lib/supabaseClient';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Plan = 'loading' | 'free' | 'premium' | 'pro';
const normalizePlanRow = (row: any): Plan => {
  if (!row) return 'free';
  if (row.is_premium === true) return 'premium';
  const raw = (row.plan ?? '').toString().trim().toLowerCase();
  if (raw === 'pro') return 'pro';
  if (['premium', 'plus', 'paid', 'trial_premium'].includes(raw)) return 'premium';
  return 'free';
};

const BASE_TRAITS: string[] = [
  'friendly','concise','proactive','analytical','motivating','candid','decisive','no-nonsense',
  'optimistic','pragmatic','structured','calm','curious','resourceful','detail-oriented',
  'big-picture','experimental','data-driven','action-oriented','empathetic','professional',
  'witty','sarcastic','playful','bossy','coaching','accountability-focused','deadline-driven',
  'minimalist','thorough',
];

export default function ZetaSetup() {
  const router = useRouter();
  const userFromHook = useUser(); // may be undefined on first render

  const [preferredUserName, setPreferredUserName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [assistantType, setAssistantType] = useState<string | null>(null);
  const [systemInstructions, setSystemInstructions] = useState('');
  const [modelId, setModelId] = useState('gpt-4o');
  const [loading, setLoading] = useState(false);

  const [plan, setPlan] = useState<Plan>('loading');
  const isPremium = plan === 'premium' || plan === 'pro';

  // Personality
  const [traits, setTraits] = useState<string[]>([]);
  const [customTraits, setCustomTraits] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');

  // Initiative cadence ⇄ notifications frequency
  const [initiativeCadence, setInitiativeCadence] =
    useState<'hourly' | 'daily' | 'weekly'>('daily');

  // fetch plan for the current user (or global default “free”)
  useEffect(() => {
    (async () => {
      try {
        const uid = userFromHook?.id || '';
        if (!uid) {
          setPlan('free');
          return;
        }
        const { data, error } = await supabase
          .from('user_projects')
          .select('is_premium, plan')
          .eq('user_id', uid)
          .limit(1);
        if (!error && data && data.length) {
          setPlan(normalizePlanRow(data[0]));
        } else {
          setPlan('free');
        }
      } catch {
        setPlan('free');
      }
    })();
  }, [userFromHook?.id]);

  const ALL_TRAITS = useMemo(() => [...BASE_TRAITS, ...customTraits], [customTraits]);

  const toggleTrait = (t: string) =>
    setTraits((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  const selectAllTraits = () => setTraits([...ALL_TRAITS]);
  const clearAllTraits = () => setTraits([]);

  const addCustomTrait = () => {
    const t = customInput.trim().toLowerCase();
    if (!t) return;
    if (!/^[a-z][a-z -]{0,23}$/.test(t)) {
      alert('Use letters, spaces, or hyphens (max 24 chars).');
      return;
    }
    if (ALL_TRAITS.includes(t)) {
      setTraits((prev) => (prev.includes(t) ? prev : [...prev, t]));
      setCustomInput('');
      return;
    }
    setCustomTraits((prev) => [...prev, t]);
    setTraits((prev) => [...prev, t]);
    setCustomInput('');
  };
  const removeCustomTrait = (t: string) => {
    setCustomTraits((prev) => prev.filter((x) => x !== t));
    setTraits((prev) => prev.filter((x) => x !== t));
  };

  const handleSubmit = async () => {
    if (!projectName || !assistantType || !modelId) {
      alert('Missing required fields');
      return;
    }
    setLoading(true);
    try {
      // ✅ Always fetch the *live* user from auth right now
      const { data: authUser, error: authErr } = await supabase.auth.getUser();
      if (authErr) {
        console.error('[auth.getUser error]', authErr);
        throw new Error('Not authenticated');
      }
      const liveUserId = authUser.user?.id;
      console.log('[env]', {
        supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
        liveUserId,
        hookUserId: userFromHook?.id,
      });
      if (!liveUserId) {
        alert('You must be signed in to create a project.');
        return;
      }

      const personalityLine = traits.length ? `Zeta’s personality: ${traits.join(', ')}.` : '';
      const cadenceLine = `Initiative cadence: ${initiativeCadence}.`;
      const mergedSystemInstructions = [personalityLine, cadenceLine, systemInstructions]
        .filter(Boolean)
        .join('\n\n');

      // Gate non-OpenAI if not premium
      const safeModelId = isPremium ? modelId : 'gpt-4o';
      const visionToSave: string | null = null;

      // 👉 Insert with the *live* user id
      const { data: projectData, error: insertError } = await supabase
        .from('user_projects')
        .insert([{
          user_id: liveUserId,                  // <— this must exist in your users/auth.users table
          name: projectName,
          vision: visionToSave,
          preferred_user_name: preferredUserName || null,
          use_type: assistantType,
          pantheon_agent: 'zeta',
          onboarding_complete: true,
          system_instructions: mergedSystemInstructions,
          model_id: safeModelId,
          personality_traits: traits,
          initiative_cadence: initiativeCadence,
          plan: plan === 'loading' ? 'free' : plan,
        }])
        .select()
        .single();

      if (insertError) {
        console.error('[user_projects insert error]', insertError);
        // Helpful hint for the classic ENV mismatch case
        if (insertError.code === '23503') {
          throw new Error(
            `User ${liveUserId} not found in users/auth.users. ` +
            `Check you are logged in and NEXT_PUBLIC_SUPABASE_URL points to the same project as your auth session.`
          );
        }
        throw insertError;
      }

      const projectId = projectData.id;

      // Skip mainframe_info for now to avoid its FK while you stabilize
      // (Re-enable later once the FK path is sorted out)

      // Create assistant
      const res = await fetch('/api/createAssistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          assistantType,
          systemInstructions: mergedSystemInstructions,
          projectId,
          fileUrls: [],
          privacyLevel: null,
          modelId: safeModelId,
          message: 'Hello Zeta, let’s begin.',
          preferredUserName,
          vision: visionToSave,
          personalityTraits: traits,
          initiativeCadence,
        }),
      });

      const assistantRes = await res.json();
      if (!res.ok) {
        console.error('[createAssistant error body]', assistantRes);
        throw new Error(assistantRes.error || 'Failed to create assistant');
      }

      router.push(`/dashboard/${projectId}`);
    } catch (err: any) {
      console.error('❌ Zeta Setup Error:', err);
      alert(`Something went wrong: ${err?.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen text-black flex items-center justify-center px-6 py-10 overflow-hidden
                    bg-gradient-to-br from-sky-50 via-sky-100 to-indigo-100">
      <div className="pointer-events-none select-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-yellow-300/40 blur-3xl" />
      <div className="pointer-events-none select-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-indigo-700/30 blur-3xl" />

      <div className="w-full max-w-6xl">
        <div className="flex items-center justify-center gap-3 mb-2">
          <Image
            src="/zeta-letterlogo.png"
            alt="Zeta Logo"
            width={72}
            height={72}
            style={{ height: 'auto' }}
          />
        </div>
        <div className="text-center mb-4">
          <h1 className="text-2xl font-bold leading-tight text-indigo-900">Zeta Build Setup</h1>
          <p className="text-sm text-indigo-800/80">
            Zeta Build AI is your intelligent executive assistant—automate tasks, analyze data,
            and accelerate your side project or business.
          </p>
        </div>

        <Card className="p-5 shadow-lg border border-white/60 bg-white/85 backdrop-blur-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* LEFT COLUMN */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-indigo-950">What&apos;s the name of your project?</label>
                <Input
                  placeholder="e.g. Crypto Portfolio"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  className="w-full h-9 text-sm"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-indigo-950">Using Zeta for work or personal?</label>
                <div className="flex gap-2">
                  <Button
                    variant={assistantType === 'Work' ? 'default' : 'outline'}
                    onClick={() => setAssistantType(assistantType === 'Work' ? null : 'Work')}
                    className="flex-1 h-9 text-sm"
                  >
                    Work
                  </Button>
                  <Button
                    variant={assistantType === 'Personal' ? 'default' : 'outline'}
                    onClick={() => setAssistantType(assistantType === 'Personal' ? null : 'Personal')}
                    className="flex-1 h-9 text-sm"
                  >
                    Personal
                  </Button>
                </div>
              </div>

              {/* Model picker — premium-gated */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-indigo-950 flex items-center gap-2">
                  Choose your model
                  {!isPremium && (
                    <span className="text-[10px] font-bold uppercase tracking-wide text-yellow-800 bg-yellow-100 border border-yellow-300 rounded-full px-2 py-0.5">
                      🔒 Premium
                    </span>
                  )}
                </label>
                <div className="relative">
                  {!isPremium && (
                    <div className="absolute inset-0 pointer-events-none rounded-md ring-1 ring-yellow-200/60" />
                  )}
                  <select
                    value={modelId}
                    onChange={(e) => setModelId(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 h-9 text-sm bg-white/90"
                  >
                    <option value="gpt-4o">GPT-4o (OpenAI)</option>
                    <option value="mistral-7b" disabled={!isPremium}>Mistral 7B</option>
                    <option value="deepseek-chat" disabled={!isPremium}>DeepSeek Chat</option>
                    <option value="phi-2" disabled={!isPremium}>Phi-2</option>
                    <option value="__custom" disabled>🚧 Use custom model</option>
                  </select>
                  {!isPremium && (
                    <p className="mt-1 text-[11px] text-indigo-900/70">
                      Only the default model is available on Free. Upgrade to use other providers or a custom model.
                    </p>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-indigo-950">What would you like Zeta to call you?</label>
                <Input
                  placeholder="Your preferred name"
                  value={preferredUserName}
                  onChange={(e) => setPreferredUserName(e.target.value)}
                  className="w-full h-9 text-sm"
                />
              </div>

              {/* Initiative level — hourly locked for Free */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-indigo-950">Zeta Initiative level</label>
                <p className="text-xs text-indigo-900/70 -mt-1">
                  How often would you like Zeta to interact with you and your project?
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(['hourly','daily','weekly'] as const).map((cad) => {
                    const disabled = cad === 'hourly' && !isPremium;
                    const active = initiativeCadence === cad;
                    return (
                      <Button
                        key={cad}
                        type="button"
                        variant={active ? 'default' : 'outline'}
                        disabled={disabled}
                        onClick={() => setInitiativeCadence(cad)}
                        className={`h-8 text-xs ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
                        title={disabled ? 'Premium feature' : undefined}
                      >
                        {cad.charAt(0).toUpperCase() + cad.slice(1)}
                        {disabled && ' 🔒'}
                      </Button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-indigo-900/70">
                  Connect through <b>Telegram</b> or <b>Email</b> so Zeta can notify you 24/7!
                </p>

                <div className="mt-2 rounded-xl border border-white/60 bg-white/80 p-2 text-center shadow-sm">
                  <Image
                    src="/zeta-productivity.png"
                    alt="Zeta being productive"
                    width={260}
                    height={110}
                    style={{ width: 'auto' }}
                    sizes="(max-width: 768px) 70vw, 260px"
                    className="mx-auto rounded-lg shadow-sm"
                    priority={false}
                  />
                  <p className="mt-1 text-[11px] text-indigo-900/70">Zeta, powering through your to-dos.</p>
                </div>
              </div>
            </div>

            {/* RIGHT COLUMN */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium text-indigo-950">
                  How would you like Zeta to help you complete this project?
                </label>
                <Textarea
                  placeholder="What kind of help do you want from Zeta? What tasks or goals matter most to you?"
                  className="w-full text-sm bg-white/90"
                  rows={6}
                  value={systemInstructions}
                  onChange={(e) => setSystemInstructions(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-medium text-indigo-950">Choose Zeta’s Personality</label>
                  <div className="ml-auto flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={selectAllTraits} className="h-7 px-2 text-xs">
                      Select all
                    </Button>
                    <Button type="button" variant="outline" onClick={clearAllTraits} className="h-7 px-2 text-xs">
                      Clear
                    </Button>
                    {traits.length > 0 && <span className="text-xs text-indigo-900/70">{traits.length} selected</span>}
                  </div>
                </div>

                <div className="flex gap-2">
                  <Input
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomTrait(); } }}
                    placeholder="Add custom adjective (e.g., relentless, laser-focused)"
                    className="h-9 text-sm bg-white/90"
                  />
                  <Button type="button" onClick={addCustomTrait} className="h-9">Add</Button>
                </div>
                {customTraits.length > 0 && (
                  <div className="flex flex-wrap gap-2 text-xs">
                    {customTraits.map((t) => (
                      <span key={t} className="inline-flex items-center gap-1 px-2 py-1 rounded-full border border-indigo-200 bg-white/90">
                        {t}
                        <button
                          type="button"
                          aria-label={`Remove ${t}`}
                          className="text-indigo-700/70 hover:text-indigo-900"
                          onClick={() => removeCustomTrait(t)}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {ALL_TRAITS.map((t) => {
                    const active = traits.includes(t);
                    return (
                      <Button
                        key={t}
                        type="button"
                        variant={active ? 'default' : 'outline'}
                        onClick={() => toggleTrait(t)}
                        aria-pressed={active}
                        className="justify-start h-8 text-xs"
                      >
                        {t}
                      </Button>
                    );
                  })}
                </div>

                <p className="text-[11px] text-indigo-900/70">
                  Selected traits become adjectives in Zeta’s system instructions for tone/behavior.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5">
            <Button
              onClick={handleSubmit}
              disabled={!projectName || !assistantType || loading}
              className="w-full h-10"
            >
              {loading ? 'Setting Up...' : 'Finish Setup'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
