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

export default function ZetaSetupCore({
  title,
  blurb,
  logo,
}: {
  title: string;
  blurb: string;
  logo: string;
}) {
  const router = useRouter();
  const user = useUser();

  const [preferredUserName, setPreferredUserName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [systemInstructions, setSystemInstructions] = useState('');
  const [traits, setTraits] = useState<string[]>([]);
  const [customTraits, setCustomTraits] = useState<string[]>([]);
  const [customInput, setCustomInput] = useState('');
  const [initiativeCadence, setInitiativeCadence] = useState<'hourly' | 'daily' | 'weekly'>('daily');
  const [isPending, startTransition] = useTransition();
  const [submitting, setSubmitting] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const handleAddTrait = () => {
    if (customInput.trim() && !customTraits.includes(customInput.trim())) {
      setCustomTraits((prev) => [...prev, customInput.trim()]);
      setCustomInput('');
    }
  };

  const handleRemoveTrait = (t: string) => {
    setTraits((prev) => prev.filter((x) => x !== t));
    setCustomTraits((prev) => prev.filter((x) => x !== t));
  };

  const handleSubmit = async () => {
    if (!user?.id) return alert('No user found');
    if (!projectName) return alert('Please name your project');

    setSubmitting(true);
    try {
      const { data, error } = await supabase.from('user_projects').insert([
        {
          user_id: user.id,
          name: projectName,
          assistant_type: title,
          system_instructions: systemInstructions,
          traits: [...traits, ...customTraits],
          initiative_cadence: initiativeCadence,
        },
      ]);

      if (error) throw error;
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      alert('Error creating project');
    } finally {
      if (mounted.current) setSubmitting(false);
    }
  };

  return (
    <div className="relative min-h-screen text-black flex items-center justify-center px-6 py-10 overflow-hidden bg-gradient-to-br from-sky-50 via-sky-100 to-indigo-100">
      <div className="pointer-events-none absolute -top-24 -left-24 h-72 w-72 rounded-full bg-yellow-300/40 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-indigo-700/30 blur-3xl" />

      <div className="w-full max-w-5xl">
        {/* Header */}
        <div className="flex flex-col items-center mb-6">
          <Image src={logo} alt="Zeta Logo" width={72} height={72} />
          <h1 className="text-3xl font-bold text-indigo-900 mt-4">{title}</h1>
          <p className="text-md text-indigo-800/80 text-center mt-2">{blurb}</p>
        </div>

        {/* Card */}
        <Card className="p-6 shadow-lg bg-white/90 backdrop-blur rounded-2xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* User & Project Info */}
            <div className="flex flex-col gap-4">
              <div>
                <label className="text-sm font-semibold text-gray-700">Preferred Name</label>
                <Input
                  value={preferredUserName}
                  onChange={(e) => setPreferredUserName(e.target.value)}
                  placeholder="How should Zeta refer to you?"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">Project Name</label>
                <Input
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  placeholder="Name your project"
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-gray-700">Initiative Cadence</label>
                <select
                  value={initiativeCadence}
                  onChange={(e) => setInitiativeCadence(e.target.value as any)}
                  className="w-full mt-1 p-2 border border-gray-300 rounded-lg"
                >
                  <option value="hourly">Hourly</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                </select>
              </div>
            </div>

            {/* System Instructions */}
            <div className="flex flex-col gap-4">
              <label className="text-sm font-semibold text-gray-700">System Instructions</label>
              <Textarea
                rows={6}
                value={systemInstructions}
                onChange={(e) => setSystemInstructions(e.target.value)}
                placeholder="Describe your assistant's behavior, tone, and objectives..."
              />
            </div>
          </div>

          {/* Traits Section */}
          <div className="mt-6">
            <h2 className="text-lg font-semibold text-indigo-900 mb-3">Personality Traits</h2>
            <div className="flex flex-wrap gap-2">
              {BASE_TRAITS.slice(0, 12).map((trait) => {
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
                    className={`px-3 py-1 rounded-full text-sm border ${
                      active
                        ? 'bg-indigo-600 text-white border-indigo-700'
                        : 'bg-white hover:bg-gray-100 border-gray-300'
                    }`}
                  >
                    {trait}
                  </button>
                );
              })}
            </div>

            {/* Custom Traits */}
            <div className="flex items-center gap-2 mt-4">
              <Input
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="Add custom trait"
              />
              <Button onClick={handleAddTrait}>Add</Button>
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {[...customTraits].map((t) => (
                <span
                  key={t}
                  onClick={() => handleRemoveTrait(t)}
                  className="cursor-pointer px-3 py-1 text-sm bg-gray-100 rounded-full hover:bg-gray-200 border border-gray-300"
                >
                  {t} ✕
                </span>
              ))}
            </div>
          </div>

          {/* Submit */}
          <div className="mt-8 flex justify-center">
            <Button
              onClick={handleSubmit}
              disabled={submitting || isPending}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-2 rounded-full"
            >
              {submitting ? 'Creating...' : 'Create Project'}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
