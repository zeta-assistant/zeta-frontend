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
      name: 'Zeta Build',
      image: '/zeta-logo.png',
      description: 'Business AI – automate, optimize, strategize',
      comingSoon: false,
    },
    {
      id: 'theta',
      name: 'Theta Learn',
      image: '/theta-logo.png',
      description: 'Study AI – learn, explain, grow',
      comingSoon: true,
    },
    {
      id: 'delta',
      name: 'Delta Grow',
      image: '/delta-logo.png',
      description: 'Wellness AI – reflect, boost, focus',
      comingSoon: true,
    },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-start px-4 py-12 space-y-8">
      <h1 className="text-4xl font-bold text-center">Pantheon</h1>
      <p className="text-md text-gray-700 text-center max-w-2xl">
        A collection of specialized AI assistants designed to enhance different parts of your life.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-5xl justify-center">
        {assistants.map((assistant) => (
          <div
            key={assistant.id}
            onClick={() => !assistant.comingSoon && setSelectedAssistant(assistant.id)}
            className={`bg-white rounded-2xl p-6 shadow-md flex flex-col items-center text-center transition cursor-pointer border-2 ${
              assistant.comingSoon
                ? 'opacity-40 border-gray-300 cursor-not-allowed'
                : selectedAssistant === assistant.id
                ? 'border-black ring-2 ring-black'
                : 'border-gray-200 hover:border-black'
            }`}
          >
            <Image
              src={assistant.image}
              alt={assistant.name}
              width={110}
              height={110}
              className="object-contain"
            />
            <p className="mt-4 text-xl font-bold">{assistant.name}</p>
            <p className="text-sm text-gray-600 mt-1">{assistant.description}</p>
            {assistant.comingSoon && (
              <p className="text-xs mt-2 text-gray-500 flex items-center gap-1">
                <span>🔒</span> Coming Soon
              </p>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleContinue}
        disabled={selectedAssistant !== 'zeta'}
        className="bg-black text-white px-8 py-3 rounded-full text-lg hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  );
}