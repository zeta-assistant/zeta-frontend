import { Suspense } from 'react';
import VerifyClient from './VerifyClient';


export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="p-6 text-center">🔄 Loading…</div>}>
      <VerifyClient />
    </Suspense>
  );
}
