'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabaseClient';

type Frequency = 'daily' | 'weekly' | 'monthly';

export type ProjectHoursModalProps = {
  open: boolean;
  onClose: () => void;
  projectId: string;
};

type TargetRow = {
  id: string;
  project_id: string;
  frequency: Frequency;
  target_hours: number;
  effective_from: string; // date
  effective_to: string | null; // date or null
};

type EntryRow = {
  id: string;
  project_id: string;
  frequency: Frequency;
  period_key: string;
  period_start: string; // date
  period_end: string; // date
  hours: number;
  source: string | null;
  note: string | null;
  created_at: string;
};

function clamp(n: number, min = 0, max = 9999) {
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Compute Monday-based week start without isoWeek plugin */
function mondayStart(d: dayjs.Dayjs) {
  const dow = (d.day() + 6) % 7; // 0 => Mon
  return d.subtract(dow, 'day').startOf('day');
}

function periodBounds(freq: Frequency) {
  const now = dayjs();
  if (freq === 'daily') {
    const start = now.startOf('day');
    const end = now.endOf('day');
    return { start, end, key: start.format('YYYY-MM-DD'), label: start.format('MMM D, YYYY') };
  }
  if (freq === 'weekly') {
    const start = mondayStart(now);
    const end = start.add(6, 'day').endOf('day');
    const key = `${start.format('GGGG')}-W${start.format('WW')}`;
    const label = `${start.format('MMM D')} – ${end.format('MMM D, YYYY')}`;
    return { start, end, key, label };
  }
  const start = now.startOf('month');
  const end = now.endOf('month');
  return { start, end, key: start.format('YYYY-MM'), label: start.format('MMMM YYYY') };
}

async function getCurrentTarget(projectId: string, freq: Frequency) {
  const today = dayjs().format('YYYY-MM-DD');
  const { data, error } = await supabase
    .from('project_hour_targets')
    .select('*')
    .eq('project_id', projectId)
    .eq('frequency', freq)
    .lte('effective_from', today)
    .or('effective_to.is.null,effective_to.gte.' + today)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle<TargetRow>();

  if (error) throw error;
  return data ?? null;
}

async function getManualHoursForPeriod(projectId: string, freq: Frequency, period_key: string) {
  const { data, error } = await supabase
    .from('project_hour_entries')
    .select('hours')
    .eq('project_id', projectId)
    .eq('frequency', freq)
    .eq('period_key', period_key)
    .eq('source', 'manual') as unknown as { data: Pick<EntryRow, 'hours'>[] | null; error: any };

  if (error) throw error;
  const sum = (data ?? []).reduce((acc, r) => acc + Number(r.hours || 0), 0);
  return sum;
}

export default function ProjectHoursModal({ open, onClose, projectId }: ProjectHoursModalProps) {
  const [freq, setFreq] = useState<Frequency>('daily');

  const { start, end, key: periodKey, label: periodLabel } = useMemo(
    () => periodBounds(freq),
    [freq],
  );

  const [targetHours, setTargetHours] = useState<number>(0);
  const [manualToAdd, setManualToAdd] = useState<number>(0);
  const [manualHours, setManualHours] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [savingTarget, setSavingTarget] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);

  const totalHours = useMemo(() => manualHours, [manualHours]);
  const pct = useMemo(() => {
    if (targetHours <= 0) return 0;
    return Math.min(100, Math.round((totalHours / targetHours) * 100));
  }, [targetHours, totalHours]);

  useEffect(() => {
    if (!open || !projectId) return; // only run when explicitly opened

    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [t, m] = await Promise.all([
          getCurrentTarget(projectId, freq),
          getManualHoursForPeriod(projectId, freq, periodKey),
        ]);

        if (cancelled) return;
        setTargetHours(Number(t?.target_hours || 0));
        setManualHours(m || 0);
        setManualToAdd(0);
      } catch (err) {
        console.error(
          'ProjectHoursModal load failed:',
          typeof err === 'object' ? JSON.stringify(err, null, 2) : String(err),
        );
        if (!cancelled) {
          setTargetHours((v) => v ?? 0);
          setManualHours((v) => v ?? 0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId, freq, periodKey]);

  async function saveTarget() {
    setSavingTarget(true);
    try {
      const today = dayjs().format('YYYY-MM-DD');

      const active = await getCurrentTarget(projectId, freq);

      if (active?.id) {
        const { error: updErr } = await supabase
          .from('project_hour_targets')
          .update({ effective_to: today })
          .eq('id', active.id);
        if (updErr) throw updErr;
      }

      const { error: insErr } = await supabase.from('project_hour_targets').insert({
        project_id: projectId,
        frequency: freq,
        target_hours: clamp(targetHours, 0, 100000),
        effective_from: today,
        effective_to: null,
      } as Partial<TargetRow>);
      if (insErr) throw insErr;
      alert('Target saved!');
    } catch (err: any) {
      console.error('saveTarget error:', JSON.stringify(err ?? {}, null, 2));
      alert('Failed to save target hours');
    } finally {
      setSavingTarget(false);
    }
  }

  async function saveManualEntry() {
    setSavingEntry(true);
    try {
      const hours = clamp(manualToAdd, 0, 100000);
      if (hours <= 0) {
        alert('Enter a positive number of hours.');
        return;
      }
      const { error } = await supabase.from('project_hour_entries').insert({
        project_id: projectId,
        frequency: freq,
        period_key: periodKey,
        period_start: start.format('YYYY-MM-DD'),
        period_end: end.format('YYYY-MM-DD'),
        hours,
        source: 'manual',
        note: null,
      } as Partial<EntryRow>);
      if (error) throw error;

      // refresh manual hours
      const sum = await getManualHoursForPeriod(projectId, freq, periodKey);
      setManualHours(sum);
      setManualToAdd(0);
      alert('Hours logged!');
    } catch (err: any) {
      console.error('saveManualEntry error:', JSON.stringify(err ?? {}, null, 2));
      alert('Failed to save hours entry');
    } finally {
      setSavingEntry(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl rounded-xl bg-indigo-950 border border-indigo-700 shadow-xl p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-indigo-700">
          <div className="text-white font-semibold">Project Hours</div>
          <button className="text-white/70 hover:text-white" onClick={onClose} aria-label="Close">
            ✖️
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Frequency selector */}
          <div className="flex gap-2">
            {(['daily', 'weekly', 'monthly'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFreq(f)}
                className={`px-3 py-1.5 rounded text-white capitalize ${
                  freq === f ? 'bg-sky-600' : 'bg-indigo-800 hover:bg-indigo-700'
                }`}
              >
                {f}
              </button>
            ))}
            <div className="ml-auto text-white/80 text-sm">
              Period: <span className="font-medium">{periodLabel}</span>
            </div>
          </div>

          {/* Zeta note */}
          <div className="flex items-start gap-3 rounded-lg border border-indigo-700 bg-indigo-900/30 p-3">
            <img
              src="/zeta-avatar.png"
              alt="Zeta"
              className="w-8 h-8 rounded-full border border-indigo-600"
            />
            <p className="text-sm text-white/90 leading-relaxed">
              You can log <span className="font-semibold">any focused time</span> you spend on this
              project — researching, planning, coding, meeting, or reviewing — even if you weren’t
              using Zeta at that moment. We’ll track your <span className="font-semibold">manual
              hours</span> against your target so you can manage your workload and momentum.
            </p>
          </div>

          {/* Target editor */}
          <div className="rounded-lg border border-indigo-700 bg-indigo-900/30 p-3">
            <div className="text-white/90 text-sm mb-2">Target hours per {freq}</div>
            <div className="flex gap-3 items-end">
              <input
                type="number"
                min={0}
                className="w-40 rounded bg-indigo-900/40 border border-indigo-600 px-2 py-1 text-white"
                value={targetHours}
                onChange={(e) => setTargetHours(clamp(Number(e.target.value)))}
              />
              <button
                disabled={savingTarget}
                onClick={saveTarget}
                className="px-4 py-2 rounded bg-sky-600 hover:bg-sky-500 text-white disabled:opacity-60"
              >
                {savingTarget ? 'Saving…' : 'Save Target'}
              </button>
            </div>
          </div>

          {/* Manual / Progress */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-lg border border-indigo-700 bg-indigo-900/30 p-3">
              <div className="text-white/80 text-sm">Manual hours (this period)</div>
              <div className="text-white text-2xl font-semibold mt-1">
                {loading ? '—' : manualHours.toFixed(1)}h
              </div>

              <div className="flex gap-2 mt-2">
                <input
                  type="number"
                  min={0}
                  step="0.25"
                  className="w-28 rounded bg-indigo-900/40 border border-indigo-600 px-2 py-1 text-white"
                  placeholder="Add…"
                  value={manualToAdd}
                  onChange={(e) => setManualToAdd(Number(e.target.value))}
                />
                <button
                  disabled={savingEntry}
                  onClick={saveManualEntry}
                  className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white disabled:opacity-60"
                >
                  {savingEntry ? 'Saving…' : 'Log'}
                </button>
              </div>
            </div>

            <div className="rounded-lg border border-indigo-700 bg-indigo-900/30 p-3">
              <div className="text-white/80 text-sm">Progress</div>
              <div className="text-white text-2xl font-semibold mt-1">
                {loading ? '—' : totalHours.toFixed(1)}h
                {targetHours > 0 && <span className="text-white/60 text-base"> / {targetHours}h</span>}
              </div>
              <div className="mt-2 h-2 w-full bg-indigo-900/60 rounded">
                <div
                  className="h-2 rounded bg-sky-500 transition-[width]"
                  style={{ width: `${pct}%` }}
                />
              </div>
              {targetHours > 0 && (
                <div className="text-white/70 text-xs mt-1">{pct}% of target</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
