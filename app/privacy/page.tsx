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
            Pantheon is committed to protecting 
            your privacy. This Privacy Policy explains what information we collect, how it is used, 
            and what rights you have over your data.
          </p>

          <h2 className="text-xl font-semibold text-slate-100 mt-8">1. Information We Collect</h2>
          <p>We collect only the information necessary to operate and improve the Pantheon platform and your Zeta assistants. This includes:</p>

          <ul className="list-disc ml-6 space-y-2">
            <li><strong>Account information</strong> — email, profile details, and authentication data.</li>
            <li><strong>User input and messages</strong> — all conversations, instructions, and interactions you have with your Zeta assistants.</li>
            <li><strong>Uploaded files</strong> — documents, spreadsheets, images, or any data you upload for use within Pantheon.</li>
            <li><strong>Project data</strong> — configuration settings, tasks, goals, and metadata related to your Zeta assistants.</li>
            <li><strong>Usage information</strong> — logs related to platform activity, feature usage, timestamps, and analytics.</li>
          </ul>

          <p className="mt-4">
            <strong>Important:</strong> As the operator of Pantheon, we (and authorized administrators) may have access 
            to your data for debugging, improving the service, preventing abuse, or providing support. 
            Access is limited and only used when necessary.
          </p>

          <h2 className="text-xl font-semibold text-slate-100 mt-8">2. How Your Data Is Used</h2>
          <p>We use your data strictly for the following purposes:</p>
          <ul className="list-disc ml-6 space-y-2">
            <li>Operating and maintaining your Zeta assistants.</li>
            <li>Improving platform functionality, intelligence, and reliability.</li>
            <li>Training Zeta on your personal preferences (only within your account).</li>
            <li>Troubleshooting errors, ensuring security, and preventing misuse.</li>
            <li>Providing customer support and responding to inquiries.</li>
          </ul>

          <p className="mt-4">
            <strong>We do not sell your data.</strong>  
            We do not use your private data to train public AI models.
          </p>

          <h2 className="text-xl font-semibold text-slate-100 mt-8">3. How AI Processing Works</h2>
          <p>
            Zeta processes your messages, files, and instructions using OpenAI’s API. 
            Your data is sent securely to OpenAI only for the purpose of generating responses, 
            performing tasks, and powering AI features.
          </p>

          <p className="mt-4">
            OpenAI does <strong>not</strong> use your submitted data to train their public models.  
            (Consistent with OpenAI’s current API data usage policies.)
          </p>

          <h2 className="text-xl font-semibold text-slate-100 mt-8">4. Where Your Data Is Stored</h2>
          <p>Your data is stored securely using:</p>

          <ul className="list-disc ml-6 space-y-2">
            <li><strong>Supabase</strong> — for database storage, authentication, and file storage.</li>
            <li><strong>OpenAI</strong> — for processing natural language and tasks.</li>
            <li><strong>Vercel</strong> — for hosting the Pantheon web application.</li>
          </ul>

          <p>
            All data transmission occurs over encrypted HTTPS connections.
          </p>

          <h2 className="text-xl font-semibold text-slate-100 mt-8">5. Who Has Access to Your Data</h2>
          <p>
            As the owner and operator of Pantheon, we may access your data only when necessary, such as:
          </p>

          <ul className="list-disc ml-6 space-y-2">
            <li>Debugging errors or issues with your Zeta assistant.</li>
            <li>Investigating potential abuse or policy violations.</li>
            <li>Providing technical support if you request help.</li>
            <li>Improving system safety, reliability, and performance.</li>
          </ul>

          <p>
            We do <strong>not</strong> browse user data unnecessarily. Access is tightly controlled and logged.
          </p>

          <h2 className="text-xl font-semibold text-slate-100 mt-8">6. Your Rights</h2>
          <p>You have full control over your data. You may:</p>

          <ul className="list-disc ml-6 space-y-2">
            <li>Delete your projects, messages, or files at any time.</li>
            <li>Request permanent deletion of your entire account and data.</li>
            <li>Update personal information linked to your account.</li>
            <li>Export your data upon request.</li>
          </ul>

          <p>
            If you wish to request deletion or have privacy concerns, contact us at:  
            <strong>pnthndev@gmail.com</strong>
          </p>

          <h2 className="text-xl font-semibold text-slate-100 mt-8">7. Security</h2>
          <p>
            We implement industry-standard security practices to safeguard your data, 
            including encryption, access controls, and secure infrastructure. 
            However, no system is completely free of risk, and we encourage users to manage 
            sensitive information thoughtfully.
          </p>

          <h2 className="text-xl font-semibold text-slate-100 mt-8">8. Data Retention</h2>
          <p>
            We retain your data only for as long as your account is active or as required 
            to operate the platform. When you delete a project or file, it is removed from 
            active storage. Full account deletion requests are permanently honored.
          </p>

          <h2 className="text-xl font-semibold text-slate-100 mt-8">9. Children’s Privacy</h2>
          <p>
            Pantheon is not intended for individuals under 13. If we become aware that data 
            from a minor has been collected, we will delete it promptly.
          </p>

          <h2 className="text-xl font-semibold text-slate-100 mt-8">10. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy as needed to reflect operational or legal changes. 
            Updated versions will be posted on this page with a revised date.
          </p>

          <h2 className="text-xl font-semibold text-slate-100 mt-8">11. Contact Us</h2>
          <p>
            For any questions about privacy, data use, or this policy, contact us at:  
            <strong> pnthndev@gmail.com </strong>
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
