'use client';

type Props = {
  projectId: string;
};

export default function NewFunctionPanel({ projectId }: Props) {
  return (
    <div className="p-6 text-white space-y-6 overflow-y-auto">
      <h3 className="text-lg font-semibold">✨ Create New Function</h3>
      <p className="text-sm text-gray-300">
        Define a new automation task for Zeta to execute.
      </p>

      <div className="bg-blue-950 border border-purple-500 rounded-xl p-4 space-y-3 text-sm text-purple-100 shadow">
        <div>
          <label className="block mb-1 text-purple-300 font-semibold">
            🧠 Function Purpose
          </label>
          <input
            type="text"
            placeholder="e.g., Extract upcoming games from site"
            className="w-full bg-blue-900 text-white px-3 py-2 rounded-md border border-purple-700 focus:outline-none"
          />
        </div>
        <div>
          <label className="block mb-1 text-purple-300 font-semibold">
            ⚙️ Trigger Condition
          </label>
          <input
            type="text"
            placeholder="e.g., Every Sunday at 8PM"
            className="w-full bg-blue-900 text-white px-3 py-2 rounded-md border border-purple-700 focus:outline-none"
          />
        </div>
      </div>

      <button
        onClick={() =>
          console.log(`📤 Save function for project: ${projectId}`)
        }
        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded shadow"
      >
        ✅ Save Function
      </button>
    </div>
  );
}