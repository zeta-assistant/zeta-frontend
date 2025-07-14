'use client';
import { useEffect, useState } from 'react';

export default function Clock() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000); // update every second

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="text-sm text-gray-500">
      🕒 {currentTime.toLocaleTimeString()}
    </div>
  );
}