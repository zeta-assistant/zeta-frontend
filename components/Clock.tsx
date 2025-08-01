'use client';
import { useEffect, useState } from 'react';

export default function Clock() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // set initial time immediately on mount
    setCurrentTime(new Date());

    return () => clearInterval(timer);
  }, []);

  if (!currentTime) return null; // avoid rendering on server

  return (
    <div className="text-sm text-gray-500">
      🕒 {currentTime.toLocaleTimeString('en-US', { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </div>
  );
}