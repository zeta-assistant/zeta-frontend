'use client';

import { useRouter } from 'next/navigation';

export default function PrivacyPage() {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <div className="mx-auto w-full max-w-4xl px-4 py-10">

        <h1 className="text-3xl font-bold mb-6">Privacy Policy</h1>

        <p className="text-sm text-slate-400 mb-10">
          Last updated: {new Date().toLocaleDateString()}
        </p>

        <section className="space-y-6 text-[15px] leading-relaxed text-slate-200">

          <p>
            Pantheon is committed to protecting your privacy and maintaining transparency. 
            This Privacy Policy outlines what information Pantheon collects, how it is used, 
            and the rights you retain over your data.
          </p>

          <h2 className="text-xl font-semibold mt-8">1. Information Pantheon Collects</h2>
          <p>Pantheon collects only the data required to operate the platform and power your Zeta assistants, including:</p>

          <ul className="list-disc ml-6 space-y-2">
            <li><strong>Account information</strong> — email, authentication details, and optional profile information.</li>
            <li><strong>User messages and interactions</strong> — all inputs, instructions, and conversations with Zeta.</li>
            <li><strong>Uploaded files</strong> — any documents, images, spreadsheets, or data you choose to provide.</li>
            <li><strong>Project and assistant data</strong> — tasks, goals, configurations, and related metadata.</li>
            <li><strong>Usage analytics</strong> — logs of activity, timestamps, and feature usage for performance monitoring.</li>
          </ul>

          <p className="mt-4">
            <strong>Administrative access:</strong>  
            Pantheon administrators may access certain data for debugging, maintenance, abuse prevention, 
            or support. Access is limited, controlled, and used only when necessary.
          </p>

          <h2 className="text-xl font-semibold mt-8">2. How Pantheon Uses Your Data</h2>
          <p>Data is used strictly for platform operation and improvement, including:</p>

          <ul className="list-disc ml-6 space-y-2">
            <li>Running and maintaining Zeta assistants.</li>
            <li>Improving Pantheon’s features, reliability, and performance.</li>
            <li>Personalizing Zeta’s behavior based on your preferences.</li>
            <li>Ensuring platform security and preventing misuse.</li>
            <li>Responding to support requests.</li>
          </ul>

          <p className="mt-4">
            <strong>Pantheon does not sell data.</strong><br />
            Pantheon does not use your private data to train public AI models.
          </p>

          <h2 className="text-xl font-semibold mt-8">3. AI Processing</h2>
          <p>
            Zeta processes your data using OpenAI’s API. Information is transmitted securely and used only 
            to produce responses, perform tasks, and power Pantheon’s AI features.
          </p>

          <p className="mt-4">
            Under current OpenAI policies, submitted data is <strong>not</strong> used to train public models.
          </p>

          <h2 className="text-xl font-semibold mt-8">4. Data Storage</h2>
          <p>Your data is stored using the following infrastructure:</p>

          <ul className="list-disc ml-6 space-y-2">
            <li><strong>Supabase</strong> — authentication, database, and file storage.</li>
            <li><strong>OpenAI</strong> — secure AI processing.</li>
            <li><strong>Vercel</strong> — hosting for the Pantheon web application.</li>
          </ul>

          <p>All transfers occur over encrypted HTTPS connections.</p>

          <h2 className="text-xl font-semibold mt-8">5. Access to Your Data</h2>
          <p>Pantheon administrators may access data only in specific circumstances:</p>

          <ul className="list-disc ml-6 space-y-2">
            <li>Diagnosing errors or technical issues.</li>
            <li>Investigating security concerns or misuse.</li>
            <li>Responding to support requests when you request help.</li>
            <li>Ensuring safe operation of Zeta assistants.</li>
          </ul>

          <p>
            Routine browsing of user data does not occur.  
            Administrative access is controlled and logged.
          </p>

          <h2 className="text-xl font-semibold mt-8">6. Your Rights</h2>
          <p>You retain full control over your data. You may:</p>

          <ul className="list-disc ml-6 space-y-2">
            <li>Delete projects, files, or messages at any time.</li>
            <li>Request full account and data deletion.</li>
            <li>Update personal account information.</li>
            <li>Request an export of your data.</li>
          </ul>

          <p>For data-related inquiries, contact: <strong>pnthndev@gmail.com</strong></p>

          <h2 className="text-xl font-semibold mt-8">7. Security</h2>
          <p>
            Pantheon uses industry-standard security practices, including encryption and access controls. 
            No system is entirely free of risk, and users are encouraged to manage sensitive information 
            thoughtfully.
          </p>

          <h2 className="text-xl font-semibold mt-8">8. Data Retention</h2>
          <p>
            Data is retained only while needed to operate the platform.  
            Deleted projects and files are removed from active storage.  
            Full account deletion requests result in permanent deletion.
          </p>

          <h2 className="text-xl font-semibold mt-8">9. Children’s Privacy</h2>
          <p>
            Pantheon is not intended for users under 13. If data from a minor is discovered, 
            it will be removed promptly.
          </p>

          <h2 className="text-xl font-semibold mt-8">10. Updates to This Policy</h2>
          <p>
            Pantheon may update this Privacy Policy over time. Updated versions will be posted on this page 
            with a revised date.
          </p>

          <h2 className="text-xl font-semibold mt-8">11. Contact</h2>
          <p>
            For privacy questions or data requests, contact:  
            <strong>pnthndev@gmail.com</strong>
          </p>

        </section>

        <div className="mt-12">
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
