'use client';

import { useRouter } from 'next/navigation';

export default function SecurityPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">

        <h1 className="text-2xl font-bold mb-4">Security</h1>
        <p className="text-sm text-slate-300 mb-6">
          This page outlines the security practices used by Pantheon / Zeta.
        </p>

        <section className="space-y-4 text-sm text-slate-200 leading-relaxed">
          <p>
            All data is encrypted in transit (TLS/HTTPS) and at rest using
            Supabase’s managed database and object storage.
          </p>
          <p>
            API keys, credentials, and access tokens are securely stored
            using environment variables and never exposed client-side.
          </p>
          <p>
            AI processing is performed via OpenAI’s API on a per-request basis.
            No long-term training or retention of your private data occurs.
          </p>
        </section>

        <div className="mt-10">
          <button
            type="button"
            onClick={() => router.back()}
            className="inline-block px-4 py-2 rounded-full border border-slate-600 text-sm hover:bg-slate-800"
          >
            ← Back
          </button>
        </div>

      </div>
    </main>
  );
}
