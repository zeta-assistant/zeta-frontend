'use client';

import React from 'react';
import { SectionCard } from './common';

export default function DataCenterView({ projectId }: { projectId: string }) {
  return (
    <SectionCard title="Data Center" subtitle="Relevant knowledge">
      <div className="text-cyan-100 text-sm">
        Project: <span className="text-cyan-50">{projectId}</span>
      </div>
    </SectionCard>
  );
}
