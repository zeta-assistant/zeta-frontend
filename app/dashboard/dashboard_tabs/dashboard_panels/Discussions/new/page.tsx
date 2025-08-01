'use client';

import React from 'react';
import { NewDiscussionForm } from '@/components/NewDiscussionForm';

export default function NewDiscussionPage() {
  return (
    <div className="p-6 bg-blue-950 min-h-screen text-white">
      <h1 className="text-2xl font-bold mb-4">➕ Start a New Discussion</h1>
      <NewDiscussionForm
        onCreate={(d) => {
          console.log('✅ New discussion created:', d);
          // Optional: redirect or show success message
        }}
      />
    </div>
  );
}