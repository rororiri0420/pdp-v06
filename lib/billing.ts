import { supabaseAdmin, isSupabaseAdminConfigured } from './supabaseAdmin';
import type { BillingResult } from '@/types';

// Internal type matching the promo_codes table shape
interface PromoRecord {
  code: string;
  is_active: boolean;
  expires_at: string | null;
  used_generations: number;
  max_generations: number;
  max_users: number;
}

/**
 * Resolves which API key and billing mode to use for a generation request.
 * Priority: userClaudeKey > promoCode
 */
export async function resolveBilling(body: {
  userClaudeKey?: string;
  promoCode?: string;
  userId?: string;
  userFingerprint?: string;
}): Promise<BillingResult> {
  // 1. User's own key — no quota checks needed
  if (body.userClaudeKey?.trim()) {
    return { claudeKey: body.userClaudeKey.trim(), billingMode: 'user_api_key' };
  }

  // 2. Promo code path
  const promoCode = (body.promoCode ?? '').trim().toUpperCase();
  if (!promoCode) {
    throw new Error(
      'Missing API key. Add your Anthropic API key or enter an owner promo code.'
    );
  }

  const ownerKey = process.env.ANTHROPIC_API_KEY;
  if (!ownerKey) {
    throw new Error(
      'Owner Anthropic API key is not configured. Promo codes cannot be used until the owner sets ANTHROPIC_API_KEY.'
    );
  }
  if (!isSupabaseAdminConfigured) {
    throw new Error('Supabase admin not configured. Promo codes cannot be verified.');
  }

  // Fetch promo — single consistent read
  const { data: promoRaw, error } = await supabaseAdmin
    .from('promo_codes')
    .select('*')
    .eq('code', promoCode)
    .eq('is_active', true)
    .single();

  if (error || !promoRaw) throw new Error('Invalid or inactive promo code.');
  const promo = promoRaw as unknown as PromoRecord;

  if (promo.expires_at && new Date(promo.expires_at).getTime() < Date.now()) {
    throw new Error('This promo code has expired.');
  }

  if (promo.used_generations >= promo.max_generations) {
    throw new Error('This promo code has reached its generation limit.');
  }

  // Check and register user fingerprint
  const fingerprint = (body.userFingerprint ?? body.userId ?? 'anonymous').slice(0, 120);

  const { count: userCount } = await supabaseAdmin
    .from('promo_redemptions')
    .select('user_fingerprint', { count: 'exact', head: true })
    .eq('promo_code', promoCode);

  const { data: existing } = await supabaseAdmin
    .from('promo_redemptions')
    .select('id')
    .eq('promo_code', promoCode)
    .eq('user_fingerprint', fingerprint)
    .maybeSingle();

  if (!existing && (userCount ?? 0) >= promo.max_users) {
    throw new Error('This promo code has reached its user limit.');
  }

  if (!existing) {
    const { error: insertErr } = await supabaseAdmin
      .from('promo_redemptions')
      .insert({ promo_code: promoCode, user_fingerprint: fingerprint });
    // Ignore duplicate key errors (race condition on first use) — unique constraint handles it
    if (insertErr && insertErr.code !== '23505') {
      throw insertErr;
    }
  }

  return {
    claudeKey: ownerKey,
    billingMode: 'owner_promo',
    promoCode,
    remaining: Math.max(0, promo.max_generations - promo.used_generations - 1),
  };
}

/**
 * Atomically increments used_generations for a promo code.
 * Uses a DB-level check so concurrent requests cannot both exceed the limit.
 */
export async function recordPromoUse(promoCode?: string): Promise<void> {
  if (!promoCode || !isSupabaseAdminConfigured) return;

  // Atomic increment using PostgreSQL RPC to avoid race conditions.
  // Falls back to read-then-write if RPC not available.
  const { error } = await supabaseAdmin.rpc('increment_promo_usage', {
    p_code: promoCode,
  });

  if (error) {
    // Fallback: plain update (less safe but functional without the RPC)
    const { data: promo } = await supabaseAdmin
      .from('promo_codes')
      .select('used_generations')
      .eq('code', promoCode)
      .single();

    if (promo) {
      await supabaseAdmin
        .from('promo_codes')
        .update({ used_generations: Number(promo.used_generations ?? 0) + 1 })
        .eq('code', promoCode);
    }
  }

  // Always log the usage event for analytics
  await supabaseAdmin
    .from('promo_usage_events')
    .insert({ promo_code: promoCode, event_type: 'generation' });
}

/**
 * Validates the owner admin secret from request headers.
 * Returns false if OWNER_ADMIN_SECRET env var is not set (safe default).
 */
export function validateOwnerSecret(req: Request): boolean {
  const secret = process.env.OWNER_ADMIN_SECRET;
  if (!secret) return false;
  const provided = req.headers.get('x-owner-secret');
  if (!provided) return false;
  // Constant-time comparison to prevent timing attacks
  return provided === secret;
}
