import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Fail fast so we don't end up with "undefined.from"
if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is missing');
if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is missing');

export const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default supabase; // allow both default and named imports