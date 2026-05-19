import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service-role client — bypasses RLS. Used only server-side. Never exposed to frontend.
export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});
