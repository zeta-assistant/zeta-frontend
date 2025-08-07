// zeta-frontend/app/layout.tsx

import './globals.css';
import type { Metadata } from 'next';
import 'katex/dist/katex.min.css';
import { SupabaseProvider } from '../components/SupabaseProvider';


export const metadata: Metadata = {
  title: 'Zeta',
  description: 'Your adaptive AI assistant',
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
      <body>
        {/* ✅ Wrap everything in SupabaseProvider */}
        <SupabaseProvider>{children}</SupabaseProvider>
      </body>
    </html>
  );
}