'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useUser } from '@supabase/auth-helpers-react';

export default function ZetaSetup() {
  const router = useRouter();
  const { user } = useUser(); // NEW way to access logged-in user
  const [projectName, setProjectName] = useState('');
  const [assistantType, setAssistantType] = useState<string | null>(null);
  const [systemInstructions, setSystemInstructions] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!projectName || !assistantType || !user) return;

    setLoading(true);

    try {
      // Step 1: Create assistant via API
      const res = await fetch('/api/createAssistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectName, assistantType, systemInstructions }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create assistant.');
      const assistantId = data.assistantId;

      // Step 2: Insert into Supabase user_projects
      const { data: projectData, error } = await supabase
        .from('user_projects')
        .insert([
          {
            user_id: user.id,
            name: projectName,
            assistant_id: assistantId,
            description: '',
            type: assistantType,
            onboarding_complete: true,
            system_instructions: systemInstructions,
          },
        ])
        .select()
        .single();

      if (error) throw error;

      console.log('✅ Project saved to Supabase:', projectData);
      router.push(`/dashboard/${projectData.id}`);
    } catch (err) {
      console.error('❌ Zeta Setup Error:', err);
      alert('Something went wrong. Check the console.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xs space-y-8 text-center">
        {/* Zeta Logo */}
        <Image
          src="/zeta-logo.png"
          alt="Zeta Logo"
          width={350}
          height={350}
          className="mx-auto mt-2"
        />

        {/* Header */}
        <div>
          <h1 className="text-4xl font-bold mb-2">Zeta Build Setup</h1>
          <p className="text-gray-700 text-base">
            Zeta Build AI is your intelligent executive assistant, built to automate tasks, analyze data, and support your
            business or project like a real teammate.
          </p>
        </div>

        {/* Project Name */}
        <div className="bg-white rounded-2xl shadow px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-gray-800">What's the name of your project?</p>
          <div className="flex justify-center">
            <input
              type="text"
              placeholder="e.g. Yogi’s Picks"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-72 px-3 py-2 rounded-lg bg-gray-100 text-gray-800 focus:outline-none focus:ring-2 focus:ring-black"
            />
          </div>
        </div>

        {/* Assistant Type */}
        <div className="bg-white rounded-2xl shadow px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-gray-800">What type of assistant do you need me to be?</p>
          <div className="flex flex-col items-center gap-3">
            {['Personal/Executive Assistant', 'Work/Career Assistant'].map((opt) => (
              <button
                key={opt}
                onClick={() => setAssistantType(assistantType === opt ? null : opt)}
                className={`w-72 px-4 py-2 rounded-xl text-sm font-medium border transition ${
                  assistantType === opt
                    ? 'bg-black text-white border-black ring-2 ring-black'
                    : 'bg-white text-gray-800 border-gray-300 hover:border-black'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* System Instructions */}
        <div className="bg-white rounded-2xl shadow px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-gray-800">Anything you want Zeta to know before we begin?</p>
          <textarea
            rows={4}
            placeholder="Write system instructions here..."
            value={systemInstructions}
            onChange={(e) => setSystemInstructions(e.target.value)}
            className="w-80 px-3 py-2 rounded-lg bg-gray-100 text-gray-800 focus:outline-none focus:ring-2 focus:ring-black resize-none"
          />
        </div>

        {/* Submit Button */}
        <button
          onClick={handleSubmit}
          disabled={!projectName || !assistantType || loading}
          className="w-72 bg-black text-white py-3 rounded-full text-lg hover:bg-gray-800 transition disabled:opacity-40"
        >
          {loading ? 'Setting Up...' : 'Finish Setup'}
        </button>
      </div>
    </div>
  );
}