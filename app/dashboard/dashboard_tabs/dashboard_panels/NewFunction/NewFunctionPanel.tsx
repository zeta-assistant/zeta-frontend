'use client';

import { useState } from 'react';

type Props = {
  projectId: string;
  fontSize: 'sm' | 'base' | 'lg';
};

const FUNCTION_KEYWORDS = [
  'Summarize',
  'Extract',
  'Compare',
  'Generate',
  'Schedule',
  'Research',
  'Review',
  'Convert',
  'Track',
  'Calculate',
  'Rephrase',
  'Clean',
];

export default function NewFunctionPanel({ projectId, fontSize }: Props) {
  const [selectedKeyword, setSelectedKeyword] = useState('Summarize');
  const [prompt, setPrompt] = useState(`${selectedKeyword} `);
  const [trigger, setTrigger] = useState('');

  const handleKeywordChange = (newKeyword: string) => {
    setSelectedKeyword(newKeyword);

    const promptWithoutKeyword = prompt.replace(/^(\w+\s)/, '');
    setPrompt(`${newKeyword} ${promptWithoutKeyword}`);
  };

  const handlePromptChange = (text: string) => {
    const promptWithoutKeyword = text.replace(/^(\w+\s)/, '');
    setPrompt(`${selectedKeyword} ${promptWithoutKeyword}`);
  };

  return (
    <div className={`p-6 text-${fontSize} text-white space-y-6 overflow-y-auto`}>
      <h3 className="text-lg font-semibold">✨ Create New Function</h3>
      <p className="text-sm text-gray-300">
        Define a new automation task for Zeta to execute.
      </p>

      <div className="bg-blue-950 border border-purple-500 rounded-xl p-4 space-y-4 text-sm text-purple-100 shadow">
        {/* 🔑 Keyword Selector */}
        <div>
          <label className="block mb-1 text-purple-300 font-semibold">🔧 Select Keyword</label>
          <select
            value={selectedKeyword}
            onChange={(e) => handleKeywordChange(e.target.value)}
            className="w-full bg-blue-900 text-white px-3 py-2 rounded-md border border-purple-700 focus:outline-none"
          >
            {FUNCTION_KEYWORDS.map((kw) => (
              <option key={kw} value={kw}>
                {kw}
              </option>
            ))}
          </select>
        </div>

        {/* 🧠 Function Prompt Input */}
        <div>
          <label className="block mb-1 text-purple-300 font-semibold">🧠 Function Prompt</label>
          <input
            type="text"
            value={prompt}
            onChange={(e) => handlePromptChange(e.target.value)}
            className="w-full bg-blue-900 text-white px-3 py-2 rounded-md border border-purple-700 focus:outline-none"
          />
        </div>

        {/* ⚙️ Trigger Input */}
        <div>
          <label className="block mb-1 text-purple-300 font-semibold">⚙️ Trigger Condition</label>
          <input
            type="text"
            value={trigger}
            onChange={(e) => setTrigger(e.target.value)}
            placeholder="e.g., Every Sunday at 8PM"
            className="w-full bg-blue-900 text-white px-3 py-2 rounded-md border border-purple-700 focus:outline-none"
          />
        </div>
      </div>

      <button
        onClick={() =>
          console.log(`📤 Save function for project: ${projectId}\nPrompt: ${prompt}\nTrigger: ${trigger}`)
        }
        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow"
      >
        ✅ Save Function
      </button>
    </div>
  );
}