import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabaseAdmin';
import { validateOwnerSecret } from '@/lib/billing';

export async function POST(req: Request) {
  try {
    if (!validateOwnerSecret(req)) {
      return NextResponse.json({ error: 'Owner admin secret required.' }, { status: 401 });
    }
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ error: 'Supabase admin not configured.' }, { status: 500 });
    }

    const body = await req.json() as { code?: string };
    const code = (body.code ?? '').trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ error: 'Missing promo code.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('promo_codes')
      .delete()
      .eq('code', code);

    if (error) throw error;

    return NextResponse.json({ deleted: code });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not delete promo code.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
