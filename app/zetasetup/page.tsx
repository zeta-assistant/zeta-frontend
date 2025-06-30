'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function zetasetup() {
  const router = useRouter();

  const [context, setContext] = useState('');
  const [role, setRole] = useState('');
  const [tone, setTone] = useState('');
  const [goals, setGoals] = useState<string[]>([]);
  const [initiative, setInitiative] = useState('');
  const [tools, setTools] = useState<string[]>([]);

  const toggleSelection = (value: string, list: string[], setter: (val: string[]) => void) => {
    setter(list.includes(value) ? list.filter(v => v !== value) : [...list, value]);
  };

  const handleSubmit = () => {
    const profile = { context, role, tone, goals, initiative, tools };
    console.log('Zeta Profile:', profile);

    // TODO: Save to Supabase or context later
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg p-8 space-y-6">
        <h2 className="text-2xl font-bold mb-2">Zeta Setup</h2>

        {/* Question 1 */}
        <div>
          <p className="font-semibold mb-2">1. Are you using Zeta for a project or as part of a business?</p>
          <div className="flex gap-4 flex-wrap">
            {['Personal Project', 'Business Owner', 'Manager', 'Employee', 'Just Exploring'].map(opt => (
              <button
                key={opt}
                onClick={() => setContext(opt)}
                className={`px-4 py-2 rounded-lg border ${
                  context === opt ? 'bg-black text-white' : 'bg-gray-100'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Question 2 (Role) */}
        {context !== 'Personal Project' && context !== 'Just Exploring' && (
          <div>
            <p className="font-semibold mb-2">2. What's your role?</p>
            <div className="flex gap-4 flex-wrap">
              {['Owner', 'Executive', 'Manager', 'Marketing/Sales', 'Developer', 'Employee'].map(opt => (
                <button
                  key={opt}
                  onClick={() => setRole(opt)}
                  className={`px-4 py-2 rounded-lg border ${
                    role === opt ? 'bg-black text-white' : 'bg-gray-100'
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Question 3 */}
        <div>
          <p className="font-semibold mb-2">3. How should Zeta speak to you?</p>
          <div className="flex gap-4 flex-wrap">
            {['Professional', 'Friendly', 'Energetic', 'Analytical', 'Adaptive'].map(opt => (
              <button
                key={opt}
                onClick={() => setTone(opt)}
                className={`px-4 py-2 rounded-lg border ${
                  tone === opt ? 'bg-black text-white' : 'bg-gray-100'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Question 4 */}
        <div>
          <p className="font-semibold mb-2">4. What should Zeta help you with first?</p>
          <div className="flex gap-3 flex-wrap">
            {[
              'Automation',
              'Data Analysis',
              'Task Management',
              'Customer Tracking',
              'Reporting',
              'Workflow Optimization',
            ].map(opt => (
              <button
                key={opt}
                onClick={() => toggleSelection(opt, goals, setGoals)}
                className={`px-4 py-2 rounded-lg border ${
                  goals.includes(opt) ? 'bg-black text-white' : 'bg-gray-100'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Question 5 */}
        <div>
          <p className="font-semibold mb-2">5. Should Zeta take initiative?</p>
          <div className="flex gap-4 flex-wrap">
            {['Yes, often', 'Occasionally', 'Only when asked'].map(opt => (
              <button
                key={opt}
                onClick={() => setInitiative(opt)}
                className={`px-4 py-2 rounded-lg border ${
                  initiative === opt ? 'bg-black text-white' : 'bg-gray-100'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* Question 6 */}
        <div>
          <p className="font-semibold mb-2">6. Connect tools Zeta should work with:</p>
          <div className="flex gap-3 flex-wrap">
            {['QuickBooks', 'Lightspeed', 'HubSpot', 'Google Sheets', 'Excel', 'None Yet'].map(opt => (
              <button
                key={opt}
                onClick={() => toggleSelection(opt, tools, setTools)}
                className={`px-4 py-2 rounded-lg border ${
                  tools.includes(opt) ? 'bg-black text-white' : 'bg-gray-100'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={handleSubmit}
          className="w-full bg-black text-white py-3 rounded-xl text-lg hover:bg-gray-800 transition"
        >
          Finish Setup
        </button>
      </div>
    </div>
  );
}