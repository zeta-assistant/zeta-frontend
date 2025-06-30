// components/LayoutWrapper.tsx
import React from 'react';

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-black">
      {children}
    </div>
  );
}