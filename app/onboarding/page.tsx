'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function PantheonSelection() {
  const router = useRouter();
  const [selectedAssistant, setSelectedAssistant] = useState<string | null>(null);

  // ✅ Directly navigate to /zetasetup/<template>
  const handleContinue = () => {
    if (!selectedAssistant) return;
    router.push(`/zetasetup/${selectedAssistant}`);
  };

  const assistants = [
    {
      id: 'base',
      name: 'Zeta (Base)',
      image: '/zeta.png',
      description: 'Start empty — no template.',
      comingSoon: false,
    },
    {
      id: 'build',
      name: 'Zeta Build',
      image: '/zeta%20build.png',
      description: 'Business ops & automation.',
      comingSoon: false,
    },
    {
      id: 'learn',
      name: 'Zeta Learn',
      image: '/zeta%20learn.png',
      description: 'Study, explain, and teach.',
      comingSoon: false,
    },
    {
      id: 'exercise',
      name: 'Zeta Exercise',
      image: '/zeta%20exercise.png',
      description: 'Fitness coaching & wellness.',
      comingSoon: false,
    },
    {
      id: 'chef',
      name: 'Zeta Chef',
      image: '/zeta%20chef.png',
      description: 'Recipes & meal planning.',
      comingSoon: false,
    },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-start px-4 py-12 space-y-8">
      <h1 className="text-4xl font-bold text-center">Choose your Zeta template</h1>
      <p className="text-md text-gray-700 text-center max-w-2xl">
        Pick a starting point. You can customize everything later.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 w-full max-w-6xl">
        {assistants.map((assistant) => {
          const selected = selectedAssistant === assistant.id;
          return (
            <button
              key={assistant.id}
              onClick={() => !assistant.comingSoon && setSelectedAssistant(assistant.id)}
              className={[
                'bg-white rounded-2xl p-6 shadow-md flex flex-col items-center text-center h-[340px]',
                'transition border-2 w-full',
                assistant.comingSoon
                  ? 'opacity-40 border-gray-300 cursor-not-allowed'
                  : selected
                  ? 'border-black ring-2 ring-black'
                  : 'border-gray-200 hover:border-black',
              ].join(' ')}
              disabled={assistant.comingSoon}
              type="button"
            >
              {/* Logo */}
              <div className="h-[120px] flex items-end justify-center">
                <Image
                  src={assistant.image}
                  alt={assistant.name}
                  width={110}
                  height={110}
                  className="object-contain"
                />
              </div>

              {/* Text */}
              <div className="flex flex-col justify-between items-center text-center flex-grow mt-4 w-full">
                <div>
                  <p className="text-xl font-bold">{assistant.name}</p>
                  <p className="text-sm text-gray-600 mt-1">{assistant.description}</p>
                </div>

                <div className="h-5 mt-4">
                  {assistant.comingSoon && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 justify-center">
                      <span>🔒</span> Coming Soon
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      <button
        onClick={handleContinue}
        disabled={!selectedAssistant}
        className="bg-black text-white px-8 py-3 rounded-full text-lg hover:bg-gray-800 transition disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Continue
      </button>
    </div>
  );
}
