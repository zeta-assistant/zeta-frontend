'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

type XPState = {
  level: number;
  pct: number;        // 0..100
  remaining: number;  // XP to next
  current: number;    // XP inside current level
  next: number;       // XP required for current level
  total: number;      // lifetime XP
};

const ZERO_XP: XPState = { level: 1, pct: 0, remaining: 0, current: 0, next: 0, total: 0 };

function formatDateAU(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });
}

function normalizeTraits(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String);
    } catch {
      return raw
        .split(/[,\n]/g)
        .map((s) => s.trim())
        .filter(Boolean);
    }
  }
  return [];
}

/** Convert total XP → UI progress using your lib’s thresholds */
async function progressFromTotal(total: number): Promise<XPState> {
  try {
    const mod: any = await import('@/lib/XP'); // uses your LEVEL_THRESHOLDS + levelProgress()
    const lp = typeof mod.levelProgress === 'function'
      ? mod.levelProgress(total)
      : null;

    if (lp) {
      return {
        level: lp.level ?? 1,
        pct: Math.max(0, Math.min(100, Number(lp.pct ?? 0))),
        remaining: Number(lp.remaining ?? 0),
        current: Number(lp.inLevel ?? 0),
        next: Number(lp.needed ?? 0),
        total: Number(total ?? 0),
      };
    }
  } catch (e) {
    console.warn('progressFromTotal() fallback:', e);
  }
  // Fallback: simple next=100 for all levels
  const next = 100;
  const current = Math.min(total % 100, 100);
  const pct = Math.round((current / next) * 100);
  return { level: 1, pct, remaining: next - current, current, next, total };
}

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

  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [personalityTraits, setPersonalityTraits] = useState<string[]>([]);
  const [xp, setXP] = useState<XPState>(ZERO_XP);

  // Prefill when opening (and grab created_at + traits + XP from user_projects)
  useEffect(() => {
    if (!showModal || !projectId) return;
    (async () => {
      const { data, error } = await supabase
        .from('user_projects')
        .select('preferred_user_name, created_at, personality_traits, xp_total, level')
        .eq('id', projectId)
        .maybeSingle();

      if (!error && data) {
        setPreferredName(data.preferred_user_name ?? '');
        setCreatedAt(data.created_at ?? null);
        setPersonalityTraits(normalizeTraits(data.personality_traits));
        const total = Number(data.xp_total ?? 0);
        const prog = await progressFromTotal(total);
        // trust server level (generated) but keep progress from total
        setXP({ ...prog, level: Number(data.level ?? prog.level) });
      } else {
        setPreferredName('');
        setCreatedAt(null);
        setPersonalityTraits([]);
        setXP(ZERO_XP);
      }
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[720px] max-w-[95%] text-indigo-900 relative">
            <button
              onClick={() => setShowModal(false)}
              className="absolute top-3 right-3 text-gray-500 hover:text-red-500 text-lg"
              title="Close"
            >
              ✖️
            </button>

            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              ⚙️ Zeta Settings
              <span className="text-xs font-medium text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full">
                Project
              </span>
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-[260px,1fr] gap-6">
              {/* Left: Zeta card */}
              <div className="rounded-2xl border border-indigo-200 bg-gradient-to-b from-white to-indigo-50 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="relative w-16 h-16 rounded-2xl overflow-hidden ring-1 ring-indigo-200 shadow">
                    <Image
                      src="/zeta.png"
                      alt="Zeta"
                      fill
                      sizes="64px"
                      className="object-cover"
                      priority
                    />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm text-indigo-700/90">Your AI companion</div>
                    <div className="font-semibold text-indigo-900 leading-tight flex items-center gap-2">
                      Zeta
                      <span className="text-[11px] font-bold px-2 py-[2px] rounded-full border border-indigo-300 bg-white shadow-sm">
                        Level {xp.level}
                      </span>
                    </div>
                    <div className="text-xs text-indigo-700/80">
                      Created on <span className="font-medium">{formatDateAU(createdAt)}</span>
                    </div>
                  </div>
                </div>

                {/* XP */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-indigo-800 mb-1">
                    <div className="font-semibold">Progress to next level</div>
                    <div className="tabular-nums">
                      {xp.current}/{xp.next} XP
                    </div>
                  </div>
                  <div className="h-3 rounded-full bg-indigo-100 overflow-hidden border border-indigo-200">
                    <div
                      className="h-full bg-indigo-500 transition-all"
                      style={{ width: `${Math.max(0, Math.min(100, xp.pct))}%` }}
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.max(0, Math.min(100, xp.pct))}
                    />
                  </div>
                  <div className="mt-1 text-[11px] text-indigo-700/80">
                    {xp.next === 0
                      ? 'Max level reached'
                      : `${xp.remaining} XP to Level ${xp.level + 1} • Total XP: ${xp.total}`}
                  </div>
                </div>

                {/* Traits */}
                <div className="mt-4">
                  <div className="text-xs font-semibold text-indigo-800 mb-1">Personality traits</div>
                  {personalityTraits.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {personalityTraits.map((t) => (
                        <span
                          key={t}
                          className="px-2 py-1 rounded-full text-[11px] bg-white border border-indigo-200 shadow-sm"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-indigo-700/70">No traits saved.</div>
                  )}
                </div>
              </div>

              {/* Right: Settings form */}
              <div className="rounded-2xl border border-indigo-200 bg-white p-4 shadow-sm">
                <div>
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

            <div className="mt-4 text-[11px] text-indigo-700/70">
              Tip: Traits come from <code className="px-1 py-0.5 bg-indigo-50 rounded border border-indigo-200">user_projects.personality_traits</code>.
              XP comes from <code className="px-1 py-0.5 bg-indigo-50 rounded border border-indigo-200">user_projects.xp_total</code> (level is generated).
            </div>
          </div>
        </div>
      )}
    </>
  );
}
