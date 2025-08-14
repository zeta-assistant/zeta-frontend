'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export async function savePreferredNameForProject(
  projectId: string,
  preferredName: string | null | undefined,
  onClose?: () => void,
  setSaving?: (saving: boolean) => void
) {
  if (!projectId) return;
  setSaving?.(true);

  try {
    const { data: sess, error: sessErr } = await supabase.auth.getSession();
    if (sessErr || !sess?.session?.user?.id) {
      alert('Not logged in');
      return;
    }
    const userId = sess.session.user.id;

    const { data: updRow, error: upErr, status } = await supabase
      .from('user_projects')
      .update({ preferred_user_name: preferredName || null })
      .eq('id', projectId)
      .eq('user_id', userId)
      .select('id, user_id, preferred_user_name')
      .maybeSingle();

    if (upErr) {
      console.error('user_projects update error (detail):', upErr);
      alert(`Couldn't save name to user_projects:\n${JSON.stringify(upErr, null, 2)}`);
      return;
    }
    if (!updRow) {
      alert(
        `Update returned no row (HTTP ${status}). This is usually RLS or an id mismatch.\n` +
          `projectId=${projectId}\nuserId=${userId}`
      );
      return;
    }

    const MF_COL = 'preferred_user_name';

    const { data: existingRow, error: checkErr } = await supabase
      .from('mainframe_info')
      .select('project_id')
      .eq('project_id', projectId)
      .maybeSingle();

    if (checkErr) {
      console.error('mainframe_info select error:', checkErr);
      alert(`Failed checking mainframe_info:\n${JSON.stringify(checkErr, null, 2)}`);
      return;
    }

    if (existingRow) {
      const { error: updErr } = await supabase
        .from('mainframe_info')
        .update({ [MF_COL]: preferredName || null })
        .eq('project_id', projectId);
      if (updErr) {
        console.error('mainframe_info update error:', updErr);
        alert(`Failed to update mainframe_info:\n${JSON.stringify(updErr, null, 2)}`);
        return;
      }
    } else {
      const { error: insErr } = await supabase
        .from('mainframe_info')
        .insert({ project_id: projectId, [MF_COL]: preferredName || null });
      if (insErr) {
        console.error('mainframe_info insert error:', insErr);
        alert(`Failed to insert mainframe_info:\n${JSON.stringify(insErr, null, 2)}`);
        return;
      }
    }

    onClose?.();
  } catch (e) {
    const msg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error('Save preferred_user_name failed:', e);
    alert(`Save failed:\n${msg}`);
  } finally {
    setSaving?.(false);
  }
}

export default function SettingsButton({
  projectId,
  selectedModelId,
  setSelectedModelId,
}: {
  projectId: string;
  selectedModelId: string;
  setSelectedModelId: (val: string) => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [preferredName, setPreferredName] = useState('');
  const [savingPrefName, setSavingPrefName] = useState(false);

  // Prefill when opening
  useEffect(() => {
    if (!showModal || !projectId) return;
    (async () => {
      const { data, error } = await supabase
        .from('user_projects')
        .select('preferred_user_name')
        .eq('id', projectId)
        .maybeSingle();
      if (!error) setPreferredName(data?.preferred_user_name ?? '');
    })();
  }, [showModal, projectId]);

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="text-indigo-900 bg-white hover:bg-yellow-100 border border-yellow-300 rounded-full p-2 shadow-lg text-xl transition"
        title="Settings"
      >
        ⚙️
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-[400px] max-w-[90%] text-indigo-900 relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-2 right-2 text-gray-500 hover:text-red-500 text-lg"
              title="Close"
            >
              ✖️
            </button>
            <h2 className="text-lg font-bold mb-3">⚙️ Zeta Settings</h2>

            {/* Engine selector */}
            <div className="mt-4">
              <label className="block text-sm font-semibold mb-1">🧠 Choose Intelligence Engine</label>
              <select
                value={selectedModelId}
                onChange={(e) => setSelectedModelId(e.target.value)}
                className="w-full border border-indigo-300 rounded-md p-2 text-sm bg-indigo-50 text-indigo-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              >
                <option value="gpt-4o">OpenAI</option>
                <option value="deepseek-chat">DeepSeek</option>
                <option value="mistral-7b">SLM</option>
              </select>
            </div>

            {/* Preferred user name */}
            <div className="mt-5">
              <label className="block text-sm font-semibold mb-1">🏷️ What should Zeta call you?</label>
              <input
                type="text"
                placeholder="e.g. Yogi"
                value={preferredName}
                onChange={(e) => setPreferredName(e.target.value)}
                className="w-full border border-indigo-300 rounded-md p-2 text-sm bg-indigo-50 text-indigo-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
              />
            </div>

            {/* Actions */}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-2 rounded-md border border-indigo-200 text-indigo-800 hover:bg-indigo-50"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  savePreferredNameForProject(
                    String(projectId),
                    preferredName,
                    () => setShowModal(false),
                    setSavingPrefName
                  )
                }
                disabled={savingPrefName}
                className="px-3 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {savingPrefName ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}