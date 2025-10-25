import { Suspense } from 'react';
import OnboardingClient from './OnboardingClient';

export default function Page() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading templates…</div>}>
      <OnboardingClient />
    </Suspense>
  );
}
