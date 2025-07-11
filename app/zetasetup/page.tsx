'use client';

import Image from 'next/image';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@supabase/auth-helpers-react';
import { supabase } from '@/lib/supabaseClient';

import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export default function ZetaSetup() {
  const router = useRouter();
  const user = useUser();

  const [projectName, setProjectName] = useState('');
  const [assistantType, setAssistantType] = useState<string | null>(null);
  const [systemInstructions, setSystemInstructions] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!projectName || !assistantType || !user) {
      alert('Missing required fields');
      return;
    }

    setLoading(true);

    try {
      const { data: projectData, error: insertError } = await supabase
        .from('user_projects')
        .insert([
          {
            user_id: user.id,
            name: projectName,
            description: '',
            type: assistantType,
            onboarding_complete: false,
            system_instructions: systemInstructions,
          },
        ])
        .select()
        .single();

      if (insertError) throw insertError;

      const projectId = projectData.id;

      const res = await fetch('/api/createAssistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName,
          assistantType,
          systemInstructions,
          projectId,
          fileUrls: [],
        }),
      });

      const assistantRes = await res.json();
      if (!res.ok) throw new Error(assistantRes.error || 'Failed to create assistant');

      await supabase
        .from('user_projects')
        .update({ onboarding_complete: true })
        .eq('id', projectId);

      router.push(`/dashboard/${projectId}`);
    } catch (err: any) {
      console.error('❌ Zeta Setup Error:', err);
      alert('Something went wrong. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-col items-center justify-center px-4 py-10">
      <div className="w-full max-w-lg space-y-6 text-center">
        <Image
          src="/zeta-logo.png"
          alt="Zeta Logo"
          width={180}
          height={180}
          className="mx-auto"
        />

        <div>
          <h1 className="text-2xl font-bold">Zeta Build Setup</h1>
          <p className="text-sm text-gray-600 mt-2">
            Zeta Build AI is your intelligent executive assistant, built to automate tasks,
            analyze data, and support your business or project like a real team member.
          </p>
        </div>

        <Card className="p-6 space-y-6 text-left shadow-md">
          <div className="space-y-2">
            <label className="text-sm font-medium text-black">
              What's the name of your project?
            </label>
            <Input
              placeholder="e.g. Yagi’s Picks"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-black">
              Using Zeta for work or personal?
            </label>
            <div className="flex gap-2">
              <Button
                variant={assistantType === 'Work' ? 'default' : 'outline'}
                onClick={() => setAssistantType(assistantType === 'Work' ? null : 'Work')}
                className="flex-1"
              >
                Work
              </Button>
              <Button
                variant={assistantType === 'Personal' ? 'default' : 'outline'}
                onClick={() => setAssistantType(assistantType === 'Personal' ? null : 'Personal')}
                className="flex-1"
              >
                Personal
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-black">
              How would you like Zeta to best assist you?
            </label>
            <Textarea
              placeholder="Optional system instructions..."
              value={systemInstructions}
              onChange={(e) => setSystemInstructions(e.target.value)}
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-black">
              Upload any relevant documents for Zeta
            </label>
            <Input type="file" multiple className="w-full" />
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!projectName || !assistantType || loading}
            className="w-full"
          >
            {loading ? 'Setting Up...' : 'Finish Setup'}
          </Button>
        </Card>
      </div>
    </div>
  );
}