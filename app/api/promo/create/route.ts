import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabaseAdmin';
import { validateOwnerSecret } from '@/lib/billing';
import type { PromoCreateBody } from '@/types';

function generateCode(prefix = 'PDP'): string {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${random}`;
}

export async function POST(req: Request) {
  try {
    if (!validateOwnerSecret(req)) {
      return NextResponse.json({ error: 'Owner admin secret required.' }, { status: 401 });
    }
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ error: 'Supabase admin not configured.' }, { status: 500 });
    }

    const body = (await req.json()) as PromoCreateBody;

    const code = (body.code || generateCode(body.prefix ?? 'PDP')).trim().toUpperCase();
    const plan_name = body.plan_name ?? 'Owner Sponsored Trial';
    const max_generations = Number(body.max_generations ?? 20);
    const max_users = Number(body.max_users ?? 1);
    const expires_at = body.expires_at ?? null;
    const notes = body.notes ?? '';

    if (max_generations < 1) {
      return NextResponse.json({ error: 'max_generations must be at least 1.' }, { status: 400 });
    }
    if (max_users < 1) {
      return NextResponse.json({ error: 'max_users must be at least 1.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('promo_codes')
      .insert({
        code,
        plan_name,
        max_generations,
        max_users,
        expires_at,
        notes,
        created_by_owner: true,
        is_active: true,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json(
          { error: `Promo code "${code}" already exists. Try again.` },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ promo: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not create promo code.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
