'use client';

import React from 'react';

type Status = 'under-construction' | 'in-progress';

type TasksSummaryProps = {
  zetaTasks: string[];
  userTasks: string[];
  zetaStatuses?: Status[];
  userStatuses?: Status[];
  className?: string;
};

function StatusBadge({ status }: { status: Status }) {
  const label = status === 'under-construction' ? 'Under construction' : 'In progress';
  const ring  = status === 'under-construction' ? 'border-amber-400' : 'border-sky-400';
  const emoji = status === 'under-construction' ? '🏗️' : '⏳';

  return (
    <span
      className={[
        'inline-flex items-center gap-1 px-2 py-[2px] rounded-full border bg-white/85',
        'text-[10px] leading-tight text-black', ring,
      ].join(' ')}
    >
      <span aria-hidden>{emoji}</span>
      <span>{label}</span>
    </span>
  );
}

function TaskRow({
  text,
  status,
}: {
  text: string;
  status: Status;
}) {
  return (
    <li className="px-2 py-1">
      <div className="flex items-start gap-2">
        <span className="text-xs mt-[2px]" aria-hidden>
          •
        </span>
        {/* Ensure this column can actually shrink/wrap */}
        <div className="min-w-0 max-w-full">
          <p className="text-[11px] leading-snug whitespace-normal break-words">
            {text}
          </p>
          <div className="mt-1">
            <StatusBadge status={status} />
          </div>
        </div>
      </div>
    </li>
  );
}

export default function TasksSummary({
  zetaTasks,
  userTasks,
  zetaStatuses,
  userStatuses,
  className = '',
}: TasksSummaryProps) {
  return (
    <div className={['w-full', className].join(' ')}>
      <div className="grid grid-cols-1 xl:grid-cols-2 divide-y xl:divide-y-0 xl:divide-x divide-slate-200 rounded-md overflow-hidden">
        {/* Zeta */}
        <section className="bg-sky-50 text-black">
          <h3 className="font-semibold text-[12px] mb-1 px-2 pt-2">🤖 Zeta’s Tasks</h3>
          <ul className="list-none m-0 p-0">
            {zetaTasks.length > 0 ? (
              zetaTasks.map((task, i) => (
                <TaskRow
                  key={`zeta-${i}`}
                  text={task}
                  status={zetaStatuses?.[i] ?? 'in-progress'}
                />
              ))
            ) : (
              <li className="italic text-[11px] px-2 py-2 opacity-70">
  Setup your project vision, goals, and Telegram for Zeta to start working on tasks!
</li>
            )}
          </ul>
        </section>

        {/* User */}
        <section className="bg-amber-50 text-black">
          <h3 className="font-semibold text-[12px] mb-1 px-2 pt-2">👤 Your Tasks</h3>
          <ul className="list-none m-0 p-0">
            {userTasks.length > 0 ? (
              userTasks.map((task, i) => (
                <TaskRow
                  key={`user-${i}`}
                  text={task}
                  status={userStatuses?.[i] ?? 'in-progress'}
                />
              ))
            ) : (
              <li className="italic text-[11px] px-2 py-2 opacity-70">None yet</li>
            )}
          </ul>
        </section>
      </div>
    </div>
  );
}
