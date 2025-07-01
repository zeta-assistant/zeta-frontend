'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function PantheonSelection() {
  const router = useRouter();
  const [selectedAssistant, setSelectedAssistant] = useState<string | null>(null);

  const handleContinue = () => {
    if (selectedAssistant === 'zeta') {
      router.push('/zetasetup');
    }
  };

  const assistants = [
    {
      id: 'zeta',
      name: 'Zeta',
      image: '/zeta-logo.png',
      description:
        'Executive/Business Assistant — helps automate tasks, optimize operations, and support strategic goals.',
      comingSoon: false,
    },
    {
      id: 'theta',
      name: 'Theta',
      image: '/theta-logo.png',
      description:
        'Learning/Teaching Assistant — study coach, explainer, and custom knowledge companion. 🧠 Coming Soon...',
      comingSoon: true,
    },
    {
      id: 'delta',
      name: 'Delta',
      image: '/delta-logo.png',
      description:
        'Emotional/Motivational Assistant — emotional support, mindset coaching, and resilience reinforcement. 💖 Coming Soon...',
      comingSoon: true,
    },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-start px-4 py-10">
      <h1 className="text-3xl font-bold mb-2">Pantheon</h1>
      <p className="text-sm text-gray-700 max-w-xl text-center mb-6">
        Pantheon is a collection of specialized AI assistants, each designed to empower a different part of your life.
        Together, they form a powerful ecosystem for organization, automation, and meaningful interaction — tailored to
        your personal and professional goals.
      </p>

      <div className="flex flex-col space-y-4 w-full max-w-3xl">
        {assistants.map((assistant) => (
          <div
            key={assistant.id}
            onClick={() =>
              !assistant.comingSoon && setSelectedAssistant(assistant.id)
            }
            className={`cursor-pointer rounded-2xl p-4 border-2 transition text-center flex flex-col items-center space-y-3 ${
              assistant.comingSoon
                ? 'border-gray-200 opacity-40 cursor-not-allowed'
                : selectedAssistant === assistant.id
                ? 'border-black ring-2 ring-black'
                : 'border-gray-300 hover:border-black'
            }`}
          >
            <Image
              src={assistant.image}
              alt={`${assistant.name} logo`}
              width={100}
              height={80}
              className="object-contain"
              priority
            />
            <p className="font-bold text-lg">{assistant.name}</p>
            <p className="text-xs text-gray-700">{assistant.description}</p>
          </div>
        ))}
      </div>

      <button
        onClick={handleContinue}
        disabled={selectedAssistant !== 'zeta'}
        className="mt-8 bg-black text-white px-8 py-2 rounded-full text-sm hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  );
}