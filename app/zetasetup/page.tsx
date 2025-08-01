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
  const [vision, setVision] = useState('');
  const [assistantType, setAssistantType] = useState<string | null>(null);
  const [systemInstructions, setSystemInstructions] = useState('');
  const [privacyLevel, setPrivacyLevel] = useState<string | null>(null);
  const [modelId, setModelId] = useState('gpt-4o');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (
      !projectName ||
      !assistantType ||
      !user ||
      !modelId ||
      vision.length < 5 ||
      vision.length > 50
    ) {
      alert('Missing or invalid required fields');
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
            vision: vision,
            use_type: assistantType,
            pantheon_agent: 'zeta',
            onboarding_complete: true,
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
          privacyLevel,
          modelId,
          message: 'Hello Zeta, let’s begin.',
        }),
      });

      const assistantRes = await res.json();
      if (!res.ok) throw new Error(assistantRes.error || 'Failed to create assistant');

      router.push(`/dashboard/${projectId}`);
    } catch (err: any) {
      console.error('❌ Zeta Setup Error:', err);
      alert('Something went wrong. See console for details.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-white text-black flex flex-row justify-center items-center px-4 py-10">
      {/* Left Zeta Mascot */}
      <div className="hidden md:flex w-1/5 justify-center">
        <Image
          src="/zeta-avatar.svg"
          alt="Zeta Left"
          width={300}
          height={300}
          className="object-contain"
        />
      </div>

      {/* Center Form */}
      <div className="w-full max-w-lg space-y-6 text-center">
        <Image
          src="/zeta-letterlogo.png"
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
              placeholder="e.g. Crypto Portfolio"
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
              Choose your model
            </label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="gpt-4o">GPT-4o (OpenAI)</option>
              <option value="mistral-7b">Mistral 7B (Local)</option>
              <option value="phi-2">Phi-2 (Local)</option>
              <option value="deepseek-chat">DeepSeek Chat (Local)</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-black">
              Describe the vision of your project
            </label>
            <Input
              placeholder="e.g. Automate weekly performance analysis"
              minLength={5}
              maxLength={50}
              value={vision}
              onChange={(e) => setVision(e.target.value)}
              className="w-full"
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-black">
              How would you like Zeta to best assist you complete this project?
            </label>
            <Textarea
              placeholder="What kind of help do you want from Zeta? What tasks or goals matter most to you?"
              className="w-full"
              rows={3}
              value={systemInstructions}
              onChange={(e) => setSystemInstructions(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-black">
              How much do you trust Zeta with private or sensitive information about this project?
            </label>
            <div className="flex flex-col gap-2">
              <Button
                variant={privacyLevel === 'full' ? 'default' : 'outline'}
                onClick={() => setPrivacyLevel(privacyLevel === 'full' ? null : 'full')}
              >
                I trust Zeta fully — nothing’s off-limits
              </Button>
              <Button
                variant={privacyLevel === 'partial' ? 'default' : 'outline'}
                onClick={() => setPrivacyLevel(privacyLevel === 'partial' ? null : 'partial')}
              >
                I’m okay sharing some sensitive data
              </Button>
              <Button
                variant={privacyLevel === 'private' ? 'default' : 'outline'}
                onClick={() => setPrivacyLevel(privacyLevel === 'private' ? null : 'private')}
              >
                I prefer not to share any sensitive data
              </Button>
            </div>
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

      {/* Right Zeta Mascot */}
      <div className="hidden md:flex w-1/5 justify-center">
        <Image
          src="/zeta-thinking.svg"
          alt="Zeta Right"
          width={300}
          height={300}
          className="object-contain"
        />
      </div>
    </div>
  );
}