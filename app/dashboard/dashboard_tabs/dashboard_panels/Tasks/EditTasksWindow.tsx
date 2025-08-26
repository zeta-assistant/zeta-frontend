'use client';

import React, { useEffect, useMemo, useState } from 'react';

/** ---------- Types ---------- */
type TaskStatus =
  | 'draft'
  | 'under_construction'
  | 'in_progress'
  | 'confirmed'
  | 'completed'
  | 'cancelled';

export default function EditTasksWindow({
  open,
  task,
  onClose,
  onSave,
  onConfirm,
}: {
  open: boolean;
  task: { id: string; title: string; status: TaskStatus; created_at: string; due_at: string | null };
  onClose: () => void;
  onSave: (patch: { title: string; created_at: string | null; due_at: string | null }) => void;
  onConfirm?: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [createdLocal, setCreatedLocal] = useState(isoToLocalInput(task.created_at));
  const [dueLocal, setDueLocal] = useState(isoToLocalInput(task.due_at));

  useEffect(() => {
    setTitle(task.title);
    setCreatedLocal(isoToLocalInput(task.created_at));
    setDueLocal(isoToLocalInput(task.due_at));
  }, [task]);

  const statusPill = useMemo(
    () => `inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] ${statusPillCls(task.status)}`,
    [task.status]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[999]">
      {/* backdrop */}
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />

      {/* dialog */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          role="dialog"
          aria-modal="true"
          className="w-[min(560px,90vw)] rounded-2xl bg-white shadow-xl border border-violet-200"
        >
          {/* header */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h4 className="text-[16px] font-semibold">Edit task</h4>
            <button
              onClick={onClose}
              className="text-xs px-2 py-1 rounded bg-slate-100 hover:bg-slate-200"
            >
              ✕ Close
            </button>
          </div>

          {/* body */}
          <div className="px-5 py-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <textarea
                className="w-full h-28 text-sm px-3 py-2 border rounded-md"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Created at</label>
                <input
                  type="datetime-local"
                  className="w-full text-sm px-3 py-2 border rounded-md"
                  value={createdLocal}
                  onChange={(e) => setCreatedLocal(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Deadline</label>
                <input
                  type="datetime-local"
                  className="w-full text-sm px-3 py-2 border rounded-md"
                  value={dueLocal}
                  onChange={(e) => setDueLocal(e.target.value)}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={statusPill}>{statusLabel(task.status)}</span>
            </div>
          </div>

          {/* footer */}
          <div className="px-5 pb-5 pt-3 flex flex-wrap justify-end gap-2 border-t border-slate-200">
            {onConfirm && (
              <button
                onClick={onConfirm}
                className="text-xs px-3 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700"
                title="Mark as in progress"
              >
                ✅ Confirm task
              </button>
            )}
            <button
              onClick={() =>
                onSave({
                  title,
                  created_at: localInputToISO(createdLocal),
                  due_at: localInputToISO(dueLocal),
                })
              }
              className="text-xs px-3 py-1 rounded bg-violet-600 text-white hover:bg-violet-700"
            >
              Save changes
            </button>
            <button
              onClick={onClose}
              className="text-xs px-3 py-1 rounded bg-slate-100 hover:bg-slate-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** ---------- Local helpers (kept here to avoid import cycles) ---------- */
function statusPillCls(status: TaskStatus) {
  switch (status) {
    case 'under_construction':
      return 'bg-amber-100 text-amber-800 border-amber-200';
    case 'in_progress':
      return 'bg-sky-100 text-sky-800 border-sky-200';
    case 'completed':
      return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    case 'cancelled':
      return 'bg-rose-100 text-rose-800 border-rose-200';
    case 'confirmed':
      return 'bg-violet-100 text-violet-800 border-violet-200';
    default:
      return 'bg-slate-100 text-slate-800 border-slate-200';
  }
}
function statusLabel(status: TaskStatus) {
  if (status === 'under_construction') return 'Under construction';
  if (status === 'in_progress') return 'In progress';
  if (status === 'completed') return 'Completed';
  if (status === 'cancelled') return 'Cancelled';
  if (status === 'confirmed') return 'Confirmed';
  return 'Draft';
}
function isoToLocalInput(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
function localInputToISO(localStr?: string | null) {
  if (!localStr) return null;
  return new Date(localStr).toISOString();
}