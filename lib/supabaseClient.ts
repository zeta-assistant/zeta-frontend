'use client';

import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs';
import { createClient } from '@supabase/supabase-js'

export const supabase = createPagesBrowserClient();