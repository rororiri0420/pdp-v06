import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabaseAdmin';
import { validateOwnerSecret } from '@/lib/billing';
import type { UserRole } from '@/types';

const VALID_ROLES: UserRole[] = [
  'owner',
  'managing_editor',
  'editor',
  'reporter',
  'contributor',
];

/**
 * Verify Supabase JWT and return the user_id, or null if invalid.
 */
async function getVerifiedUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !isSupabaseAdminConfigured) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// GET /api/users — owner only, list all user profiles
export async function GET(req: Request) {
  try {
    if (!validateOwnerSecret(req)) {
      return NextResponse.json({ error: 'Owner admin secret required.' }, { status: 401 });
    }
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ error: 'Supabase admin not configured.' }, { status: 500 });
    }

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return NextResponse.json({ users: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not load users.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/users — upsert own profile (JWT auth) or change role (owner secret)
export async function POST(req: Request) {
  try {
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ error: 'Supabase admin not configured.' }, { status: 500 });
    }

    const isOwner = validateOwnerSecret(req);

    // Non-owner callers must authenticate with their JWT
    let verifiedUserId: string | null = null;
    if (!isOwner) {
      verifiedUserId = await getVerifiedUserId(req);
      if (!verifiedUserId) {
        return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
      }
    }

    const body = await req.json() as {
      user_id?: string;
      display_name?: string;
      role?: UserRole;
    };

    // Determine which user_id to operate on
    const targetUserId = isOwner
      ? (body.user_id ?? verifiedUserId)
      : verifiedUserId; // non-owner can only upsert their own profile

    if (!targetUserId) {
      return NextResponse.json({ error: 'user_id is required.' }, { status: 400 });
    }

    // Non-owner cannot set their own role
    const role = isOwner && body.role && VALID_ROLES.includes(body.role)
      ? body.role
      : undefined;

    const upsertData: Record<string, unknown> = {
      user_id: targetUserId,
      display_name: body.display_name ?? '',
    };
    if (role) upsertData.role = role;

    const { data, error } = await supabaseAdmin
      .from('user_profiles')
      .upsert(upsertData, { onConflict: 'user_id' })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ profile: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not save user profile.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
