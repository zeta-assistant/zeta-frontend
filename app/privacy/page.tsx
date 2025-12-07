'use client';

import { useRouter } from 'next/navigation';

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">

        <h1 className="text-2xl font-bold mb-4">Privacy Policy</h1>
        <p className="text-sm text-slate-300 mb-6">
          This is a placeholder privacy policy for Pantheon / Zeta.
          Replace this text with your official policy when ready.
        </p>

        <section className="space-y-4 text-sm text-slate-200 leading-relaxed">
          <p>
            We only collect the information required to operate your Zeta assistant,
            such as projects, messages, and files you upload.
          </p>
          <p>
            Your data is never sold or shared. All processing is performed solely
            to provide and improve your experience with the platform.
          </p>
          <p>
            You may delete your projects and uploaded files at any time.
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
