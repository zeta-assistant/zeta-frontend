// lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.SERVICE_ROLE ??           // fallback if you used this name before
  process.env.SUPABASE_KEY              // another common alias

if (!supabaseUrl) throw new Error('SUPABASE_URL is required')
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})