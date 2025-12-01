'use client';

import React, { useState, useEffect, useRef, useTransition } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useUser } from '@supabase/auth-helpers-react';
import { supabase } from '@/lib/supabaseClient';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

const BASE_TRAITS = [
  'friendly', 'concise', 'proactive', 'analytical', 'motivating', 'candid', 'decisive', 'no-nonsense',
  'optimistic', 'pragmatic', 'structured', 'calm', 'curious', 'resourceful', 'detail-oriented',
  'big-picture', 'experimental', 'data-driven', 'action-oriented', 'empathetic', 'professional',
  'witty', 'sarcastic', 'playful', 'bossy', 'coaching', 'accountability-focused', 'deadline-driven',
  'minimalist', 'thorough',
];

type Props = {
  title: string;
  blurb: string;
  logo?: string; // kept so existing calls with { logo } still type-check
};

export default function ZetaSetupCore({ title, blurb }: Props) {
  const router = useRouter();
  const user = useUser();

  const [preferredUserName, setPreferredUserName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [systemInstructions, setSystemInstructions] = useState('');
  const [traits, setTraits] = useState<string[]>([]);
  const [customTraits, setCustomTraits] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [initiativeCadence, setInitiativeCadence] = useState('daily');
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleAddTrait = () => {
    const v = customInput.trim();
    if (v && !customTraits.includes(v)) {
      setCustomTraits((prev) => [...prev, v]);
      setCustomInput('');
    }
  };

  const handleRemoveTrait = (t: string) => {
    setTraits((prev) => prev.filter((x) => x !== t));
    setCustomTraits((prev) => prev.filter((x) => x !== t));
  };

  const handleSubmit = async () => {
    if (!user?.id) {
      alert('No user found – please log in.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase
        .from('user_projects')
        .insert({
          user_id: user.id,
          name: projectName || 'Zeta Project',
        })
        .select('id')
        .single();

      if (error) {
        alert(error.message || 'Error creating project');
        return;
      }

      const projectId = data?.id;
      if (!projectId) return;

      startTransition(() => router.push(`/dashboard/${projectId}`));
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };

  return (
    <div
      className="
        relative min-h-screen text-white
        bg-gradient-to-br from-[#070b21] via-[#0b1250] to-[#14237a]
        px-4 md:px-8 py-6
      "
    >
      {/* soft background glows (keep, but subtle) */}
      <div className="pointer-events-none absolute -top-32 -left-40 h-[340px] w-[340px] bg-[#00aaff]/12 blur-[110px] rounded-full" />
      <div className="pointer-events-none absolute -bottom-32 -right-40 h-[340px] w-[340px] bg-[#6d4aff]/15 blur-[110px] rounded-full" />

      {/* 3-column layout: avatar | main card | avatar */}
      <div className="relative z-10 max-w-6xl mx-auto flex items-start justify-center gap-4">
        {/* LEFT AVATAR (desktop only, no glow) */}
        <div className="hidden lg:flex flex-col items-center pt-10 w-40 shrink-0">
          <Image
            src="/zeta-avatar.svg"
            alt="Zeta Left"
            width={150}
            height={150}
          />
        </div>

        {/* MAIN CARD COLUMN */}
        <div className="w-full max-w-3xl">
          <Card className="p-5 md:p-7 bg-white text-slate-900 rounded-2xl shadow-2xl space-y-6">
            {/* Title + blurb INSIDE card */}
            <div className="text-center mb-2">
              <h1 className="text-3xl md:text-4xl font-bold text-indigo-900">
                {title}
              </h1>
              <p className="text-xs md:text-sm text-gray-600 mt-2 max-w-2xl mx-auto">
                {blurb}
              </p>
            </div>

            {/* STEP 1 */}
            <div className="space-y-1">
              <h2 className="text-base md:text-lg font-semibold text-indigo-900">
                Step 1 · Project basics
              </h2>
              <p className="text-[11px] md:text-xs text-gray-500">
                Name your Zeta and set how often it checks in. You can change this later.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* left side of step 1 */}
              <div className="flex flex-col gap-3">
                <div>
                  <label className="text-[11px] font-semibold text-gray-700">
                    Preferred name
                  </label>
                  <Input
                    value={preferredUserName}
                    onChange={(e) => setPreferredUserName(e.target.value)}
                    placeholder="What should Zeta call you?"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-700">
                    Project name
                  </label>
                  <Input
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    placeholder="Weight Loss Plan 2025"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-gray-700">
                    Initiative cadence
                  </label>
                  <select
                    value={initiativeCadence}
                    onChange={(e) => setInitiativeCadence(e.target.value)}
                    className="w-full p-2 text-sm border border-gray-300 rounded-lg mt-1"
                  >
                    <option value="hourly">Hourly</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                  </select>
                </div>
              </div>

              {/* right side of step 1 */}
              <div className="flex flex-col">
                <label className="text-[11px] font-semibold text-gray-700">
                  System instructions <span className="text-gray-400">(optional)</span>
                </label>
                <Textarea
                  rows={6}
                  className="text-sm mt-1"
                  value={systemInstructions}
                  onChange={(e) => setSystemInstructions(e.target.value)}
                  placeholder="Describe your assistant's behavior, tone, and objectives..."
                />
                <p className="text-[10px] text-gray-400 mt-1">
                  You can refine this later inside the dashboard.
                </p>
              </div>
            </div>

            {/* STEP 2 */}
            <div className="border-top border-gray-300 pt-4">
              <div className="flex justify-between items-center mb-2">
                <h2 className="text-base md:text-lg font-semibold text-indigo-900">
                  Step 2 · Personality (optional)
                </h2>
                <span className="text-[10px] text-gray-500">You can skip this.</span>
              </div>

              <div className="space-y-3">
                <p className="text-[11px] text-gray-600">
                  Pick a few traits to shape how Zeta talks to you.
                </p>

                <div className="flex flex-wrap gap-2 max-h-28 overflow-y-auto">
                  {BASE_TRAITS.slice(0, 18).map((trait) => {
                    const active = traits.includes(trait);
                    return (
                      <button
                        key={trait}
                        type="button"
                        onClick={() =>
                          setTraits((prev) =>
                            active ? prev.filter((t) => t !== trait) : [...prev, trait]
                          )
                        }
                        className={`px-3 py-1 rounded-full text-[11px] border ${
                          active
                            ? 'bg-indigo-600 text-white border-indigo-700'
                            : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {trait}
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-2">
                  <Input
                    value={customInput}
                    onChange={(e) => setCustomInput(e.target.value)}
                    placeholder="Add custom trait"
                    className="text-sm"
                  />
                  <Button
                    onClick={handleAddTrait}
                    type="button"
                    variant="outline"
                    className="text-[11px] px-3 py-1"
                  >
                    Add
                  </Button>
                </div>

                {customTraits.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {customTraits.map((t) => (
                      <span
                        key={t}
                        onClick={() => handleRemoveTrait(t)}
                        className="cursor-pointer px-3 py-1 text-[11px] bg-gray-100 rounded-full border border-gray-300 hover:bg-gray-200"
                      >
                        {t} ✕
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* SUBMIT */}
            <div className="pt-2 flex justify-center">
              <Button
                onClick={handleSubmit}
                disabled={submitting || isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-10 py-2 rounded-full text-sm"
              >
                {submitting ? 'Creating…' : 'Create Project'}
              </Button>
            </div>
          </Card>
        </div>

        {/* RIGHT AVATAR (desktop only, no glow) */}
        <div className="hidden lg:flex flex-col items-center pt-10 w-40 shrink-0">
          <Image
            src="/zeta-avatar.svg"
            alt="Zeta Right"
            width={150}
            height={150}
          />
        </div>
      </div>
    </div>
  );
}
