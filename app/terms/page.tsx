'use client';

import { useRouter } from 'next/navigation';

export default function TermsPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">

        <h1 className="text-2xl font-bold mb-4">Terms of Service</h1>
        <p className="text-sm text-slate-300 mb-6">
          These Terms outline the rules for using Pantheon / Zeta.
        </p>

        <section className="space-y-4 text-sm text-slate-200 leading-relaxed">
          <p>
            By using this platform, you agree to use Zeta responsibly and not engage
            in misuse, abuse, security exploitation, or illegal activity.
          </p>
          <p>
            All AI outputs should be reviewed by you. Pantheon / Zeta is not
            responsible for outcomes based solely on AI-generated responses.
          </p>
          <p>
            You may stop using the platform at any time.
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
