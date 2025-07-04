import './globals.css';
import { Geist, Geist_Mono } from 'next/font/google';
import LayoutWrapper from '@/components/LayoutWrapper';
import SupabaseProvider from '@/components/SupabaseProvider'; // ✅ new wrapper

const geistSans = Geist({
  subsets: ['latin'],
  variable: '--font-geist-sans',
});

const geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
});

export const metadata = {
  title: 'Pantheon',
  description: 'Home of Zeta AI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <SupabaseProvider>
          <LayoutWrapper>{children}</LayoutWrapper>
        </SupabaseProvider>
      </body>
    </html>
  );
}