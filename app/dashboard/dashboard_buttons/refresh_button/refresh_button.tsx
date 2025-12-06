'use client';
import { useState } from 'react';
import { FiRefreshCw } from 'react-icons/fi'; // <-- crisp refresh icon

type Props = {
  onRefresh: () => Promise<void>;
  refreshing?: boolean;
  variant?: 'fab' | 'inline';
  className?: string;
};

export default function RefreshButton({
  onRefresh,
  refreshing,
  variant = 'inline',
  className = '',
}: Props) {
  const [localLoading, setLocalLoading] = useState(false);
  const useLocal = refreshing === undefined;
  const isLoading = refreshing || localLoading;

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
      ? 'h-8 w-8 flex items-center justify-center rounded-md'
      : 'h-11 w-11 flex items-center justify-center rounded-full';

  const palette = isLoading
    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
    : 'bg-white text-blue-600 hover:bg-blue-50 border border-blue-300';

  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      title={isLoading ? 'Refreshing…' : 'Refresh'}
      className={`${base} shadow transition ${palette} ${className}`}
    >
      <FiRefreshCw
        className={`text-lg ${isLoading ? 'animate-spin' : ''}`}
      />
    </button>
  );
}
