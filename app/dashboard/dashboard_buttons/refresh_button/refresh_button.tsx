'use client';
import { useState } from 'react';

type Props = {
  onRefresh: () => Promise<void>;
  refreshing?: boolean;
  variant?: 'fab' | 'inline';
  className?: string;
};

export default function RefreshButton({
  onRefresh,
  refreshing,
  variant = 'fab',
  className = '',
}: Props) {
  const [localLoading, setLocalLoading] = useState(false);
  const useLocal = refreshing === undefined;
  const disabled = !!refreshing || localLoading;

  const handleClick = async () => {
    if (useLocal) setLocalLoading(true);
    try {
      await onRefresh();
    } finally {
      if (useLocal) setLocalLoading(false);
    }
  };

  const base =
    variant === 'inline'
      ? 'h-8 px-3 text-sm rounded-md border'
      : 'w-11 h-11 text-xl rounded-full border px-0 py-0';

  const palette = disabled
    ? 'bg-gray-300 text-gray-600 cursor-not-allowed border-gray-300'
    : 'text-blue-600 bg-white hover:bg-blue-100 border-blue-300';

  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      title={disabled ? 'Refreshing…' : 'Refresh'}
      className={`${base} shadow-lg transition ${palette} ${className}`}
    >
      🔄
    </button>
  );
}