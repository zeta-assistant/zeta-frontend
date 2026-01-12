// zeta-frontend/app/layout.tsx

import './globals.css';
import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import { SupabaseProvider } from '../components/SupabaseProvider';

export const metadata: Metadata = {
  title: 'Zeta',
  description: 'Your adaptive AI assistant',

  // ✅ PWA
  manifest: '/manifest.webmanifest',
  themeColor: '#0B1220',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Pantheon',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icons/icon-192.png' }],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* ✅ MathJax script for LaTeX rendering */}
        <script
          id="mathjax-script"
          async
          src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js"
        />
      </head>

      <body className="bg-slate-950 text-slate-50">
        <SupabaseProvider>
          <div className="flex min-h-screen flex-col">
            <main className="flex-1">{children}</main>

            <footer className="w-full border-t border-slate-800 bg-slate-950">
              <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-[11px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
                <span>© {new Date().getFullYear()} Pantheon / Zeta.</span>
                <div className="flex flex-wrap items-center gap-3">
                  <a href="/privacy" className="hover:text-slate-100">
                    Privacy
                  </a>
                  <a href="/terms" className="hover:text-slate-100">
                    Terms
                  </a>
                  <a href="/security" className="hover:text-slate-100">
                    Security
                  </a>
                  <a href="/support" className="hover:text-slate-100">
                    Support
                  </a>
                </div>
              </div>
            </footer>
          </div>
        </SupabaseProvider>
      </body>
    </html>
  );
}