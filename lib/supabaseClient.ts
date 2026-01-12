// lib/supabaseClient.ts
'use client';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    [
      'Missing Supabase env vars.',
      'Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local',
      'Then restart: npm run dev',
    ].join(' ')
  );
}

// ✅ Guardrail: prevent accidentally using local Supabase when you want hosted
const allowLocal = process.env.NEXT_PUBLIC_ALLOW_LOCAL_SUPABASE === 'true';
const isLocal =
  supabaseUrl.includes('127.0.0.1') ||
  supabaseUrl.includes('localhost') ||
  supabaseUrl.includes(':54321');

if (isLocal && !allowLocal) {
  throw new Error(
    [
      `Supabase URL is LOCAL (${supabaseUrl}).`,
      'If you want hosted, set NEXT_PUBLIC_SUPABASE_URL=https://inprydzukperccgtxgvx.supabase.co',
      'If you really want local, set NEXT_PUBLIC_ALLOW_LOCAL_SUPABASE=true',
    ].join(' ')
  );
}

if (process.env.NODE_ENV === 'development') {
  // eslint-disable-next-line no-console
  console.log('[supabase] url =', supabaseUrl);
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    detectSessionInUrl: true, // keep your reset-password behavior
    autoRefreshToken: true,
  },
});
