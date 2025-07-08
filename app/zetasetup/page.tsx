'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { useUser } from '@supabase/auth-helpers-react';

export default function ZetaSetup() {
  const router = useRouter();
  const user = useUser();

  const [projectName, setProjectName] = useState('');
  const [assistantType, setAssistantType] = useState<string | null>(null);
  const [systemInstructions, setSystemInstructions] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
  console.log("🧪 handleSubmit triggered with:", {
    projectName,
    assistantType,
    user,
  });

  if (!projectName || !assistantType || !user) {
    alert('Missing required fields');
    return;
  }

  setLoading(true);

  try {
    // Step 1: Insert a new project row first (without assistant ID)
    const { data: projectData, error: insertError } = await supabase
      .from('user_projects')
      .insert([
        {
          user_id: user.id,
          name: projectName,
          description: '',
          type: assistantType,
          onboarding_complete: false, // Will set to true after assistant created
          system_instructions: systemInstructions,
        },
      ])
      .select()
      .single();

    if (insertError) throw insertError;

    const projectId = projectData.id;
    console.log('🆕 Supabase project created with ID:', projectId);

    // Step 2: Call OpenAI Assistant creation API with the project ID
    const res = await fetch('/api/createAssistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectName,
        assistantType,
        systemInstructions,
        projectId, // ✅ pass this to the backend
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to create assistant');

    const assistantId = data.assistantId;
    console.log('✅ Assistant created with ID:', assistantId);

    // Step 3: Update onboarding_complete = true
    await supabase
      .from('user_projects')
      .update({ onboarding_complete: true })
      .eq('id', projectId);

    // Step 4: Redirect to dashboard
    router.push(`/dashboard/${projectId}`);
  } catch (err) {
    console.error('❌ Zeta Setup Error:', err);
    alert('Something went wrong. See console for details.');
  } finally {
    setLoading(false);
  }
};
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-xs space-y-8 text-center">
        <Image
          src="/zeta-logo.png"
          alt="Zeta Logo"
          width={350}
          height={350}
          className="mx-auto mt-2"
        />

        <div>
          <h1 className="text-4xl font-bold mb-2">Zeta Build Setup</h1>
          <p className="text-gray-700 text-base">
            Zeta Build AI is your intelligent executive assistant, built to automate tasks, analyze data, and support your business or project like a real teammate.
          </p>
        </div>

        {/* Project Name */}
        <div className="bg-white rounded-2xl shadow px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-gray-800">What’s the name of your project?</p>
          <input
            type="text"
            placeholder="e.g. Yogi’s Picks"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-72 px-3 py-2 rounded-lg bg-gray-100 text-gray-800 focus:outline-none focus:ring-2 focus:ring-black"
          />
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

        {/* Instructions */}
        <div className="bg-white rounded-2xl shadow px-4 py-4 space-y-2">
          <p className="text-sm font-semibold text-gray-800">Anything Zeta should know before we begin?</p>
          <textarea
            rows={4}
            placeholder="Optional system instructions..."
            value={systemInstructions}
            onChange={(e) => setSystemInstructions(e.target.value)}
            className="w-80 px-3 py-2 rounded-lg bg-gray-100 text-gray-800 focus:outline-none focus:ring-2 focus:ring-black resize-none"
          />
        </div>

        {/* Finish Setup Button */}
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
