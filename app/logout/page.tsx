'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    const logout = async () => {
      console.log('Signing out...');
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('Error signing out:', error.message);
      } else {
        console.log('Signed out successfully. Redirecting...');
        router.replace('/login');
      }
    };

    logout();
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <p className="text-lg text-gray-600">Logging out...</p>
    </div>
  );
}
