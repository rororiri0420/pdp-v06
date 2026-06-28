import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabaseAdmin';
import { validateOwnerSecret } from '@/lib/billing';

export async function GET(req: Request) {
  try {
    if (!validateOwnerSecret(req)) {
      return NextResponse.json({ error: 'Owner admin secret required.' }, { status: 401 });
    }
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ error: 'Supabase admin not configured.' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const activeOnly = searchParams.get('active') === 'true';

    let query = supabaseAdmin
      .from('promo_codes')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (activeOnly) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ promos: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not load promo codes.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
