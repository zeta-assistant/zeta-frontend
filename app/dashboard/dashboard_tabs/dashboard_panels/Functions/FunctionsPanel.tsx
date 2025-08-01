'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  projectId: string;
};

export default function FunctionsPanel({ projectId }: Props) {
  const router = useRouter();

  return (
    <div className="p-6 overflow-y-auto text-sm text-indigo-200 space-y-6">
      {/* 🛠️ Header */}
      <div>
        <h2 className="text-lg text-white font-semibold">🛠️ Custom Functions</h2>
        <p className="text-gray-400 text-sm mt-1">
          Build or manage the automation tools Zeta uses to handle your data and logic.
        </p>
      </div>

      {/* 🧪 Example Function Preview */}
      <div className="bg-blue-950 border border-indigo-500 rounded-lg p-4 shadow text-indigo-200">
        Example: <span className="italic">“Scrape schedule + inject into memory”</span> — shows here when created.
      </div>

      {/* ➕ Build New Function Button */}
      <div className="pt-2">
        <button
          onClick={() => router.push(`/dashboard/${projectId}/custombuild`)}
          className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg shadow text-sm"
        >
          ➕ Build New Function
        </button>
      </div>
    </div>
  );
}