import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export const isSupabaseAdminConfigured = Boolean(url && key);
export const supabaseAdmin = isSupabaseAdminConfigured
  ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  : (null as unknown as ReturnType<typeof createClient>);
