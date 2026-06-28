import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabaseAdmin';
import { validateOwnerSecret } from '@/lib/billing';
import type { PromoUpdateBody } from '@/types';

export async function POST(req: Request) {
  try {
    if (!validateOwnerSecret(req)) {
      return NextResponse.json({ error: 'Owner admin secret required.' }, { status: 401 });
    }
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ error: 'Supabase admin not configured.' }, { status: 500 });
    }

    const body = (await req.json()) as PromoUpdateBody;
    const code = (body.code ?? '').trim().toUpperCase();

    if (!code) {
      return NextResponse.json({ error: 'Missing promo code.' }, { status: 400 });
    }

    const allowedFields = [
      'plan_name',
      'max_generations',
      'max_users',
      'expires_at',
      'is_active',
      'notes',
    ] as const;

    const patch: Partial<Record<(typeof allowedFields)[number], unknown>> = {};
    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        patch[key] = body[key];
      }
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No fields to update.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .update(patch)
      .eq('code', code)
      .select('*')
      .single();

    if (error) throw error;

    return NextResponse.json({ promo: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not update promo code.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
