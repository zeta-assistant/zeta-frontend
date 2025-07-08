'use client';

import { createBrowserClient } from '@supabase/ssr';
import { createContext, useContext, useState } from 'react';
import { SessionContextProvider } from '@supabase/auth-helpers-react';

import { supabase } from '@/lib/supabaseClient';

export default function SupabaseProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionContextProvider supabaseClient={supabase}>
      {children}
    </SessionContextProvider>
  );
}