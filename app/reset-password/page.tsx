// app/reset-password/page.tsx
import { Suspense } from 'react';
import ResetPasswordClient from './ResetPasswordClient';

export const dynamic = 'force-dynamic';

function Fallback() {
  return (
    <main className="min-h-screen grid place-items-center bg-gradient-to-b from-sky-100 to-indigo-100 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow p-6 text-sm text-[#0f1b3d]/70">
        Preparing your session…
      </div>
    </main>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <ResetPasswordClient />
    </Suspense>
  );
}
