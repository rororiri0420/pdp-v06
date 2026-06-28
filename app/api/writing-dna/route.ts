import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabaseAdmin';
import type { WritingDNA } from '@/types';

/**
 * Extract and verify the caller's Supabase JWT.
 * Returns the verified user_id or null if invalid/missing.
 */
async function getVerifiedUserId(req: Request): Promise<string | null> {
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token || !isSupabaseAdminConfigured) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user.id;
}

// GET /api/writing-dna — load DNA for the authenticated user
export async function GET(req: Request) {
  try {
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ dna: null });
    }

    const userId = await getVerifiedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('writing_dna')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    return NextResponse.json({ dna: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not load writing DNA.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/writing-dna — save DNA for the authenticated user
export async function POST(req: Request) {
  try {
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ error: 'Supabase admin not configured.' }, { status: 500 });
    }

    const userId = await getVerifiedUserId(req);
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
    }

    const body = await req.json() as { dna: WritingDNA };

    // Validate basic shape
    if (!body.dna || typeof body.dna !== 'object') {
      return NextResponse.json({ error: 'dna object is required.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('writing_dna')
      .upsert(
        {
          user_id: userId,
          phrases: Array.isArray(body.dna.phrases) ? body.dna.phrases : [],
          rhythm: typeof body.dna.rhythm === 'string' ? body.dna.rhythm : '',
          paragraph_length: ['short', 'medium', 'long', 'mixed'].includes(body.dna.paragraphLength)
            ? body.dna.paragraphLength
            : 'medium',
          vocabulary: Array.isArray(body.dna.vocabulary) ? body.dna.vocabulary : [],
          emotional_style: typeof body.dna.emotionalStyle === 'string' ? body.dna.emotionalStyle : '',
          narrative_style: typeof body.dna.narrativeStyle === 'string' ? body.dna.narrativeStyle : '',
          language_mix: typeof body.dna.languageMix === 'string' ? body.dna.languageMix : '',
          avoidances: Array.isArray(body.dna.avoidances) ? body.dna.avoidances : [],
        },
        { onConflict: 'user_id' }
      )
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ dna: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not save writing DNA.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
