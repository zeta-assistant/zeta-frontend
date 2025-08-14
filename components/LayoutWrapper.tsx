// components/LayoutWrapper.tsx
import React from 'react';
import 'katex/dist/katex.min.css'; // 🔥 import it here globally

export default function LayoutWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-blue-950 text-white">
      {children}
    </div>
  );
}