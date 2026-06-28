import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseAdminConfigured } from '@/lib/supabaseAdmin';
import { validateOwnerSecret } from '@/lib/billing';

// GET /api/desks — return all active desks (builtin + custom)
export async function GET() {
  try {
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ desks: [] });
    }

    const { data, error } = await supabaseAdmin
      .from('desks')
      .select('*')
      .eq('is_active', true)
      .order('is_builtin', { ascending: false })
      .order('name', { ascending: true });

    if (error) throw error;
    return NextResponse.json({ desks: data ?? [] });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not load desks.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/desks — create a custom desk (owner only)
export async function POST(req: Request) {
  try {
    if (!validateOwnerSecret(req)) {
      return NextResponse.json({ error: 'Owner admin secret required.' }, { status: 401 });
    }
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ error: 'Supabase admin not configured.' }, { status: 500 });
    }

    const body = await req.json() as {
      id: string;
      name: string;
      description?: string;
    };

    if (!body.id || !body.name) {
      return NextResponse.json({ error: 'id and name are required.' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('desks')
      .insert({
        id: body.id.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
        name: body.name.trim(),
        description: body.description?.trim() ?? '',
        is_builtin: false,
        is_active: true,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'A desk with this ID already exists.' }, { status: 409 });
      }
      throw error;
    }

    return NextResponse.json({ desk: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not create desk.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/desks — deactivate a custom desk (owner only)
export async function DELETE(req: Request) {
  try {
    if (!validateOwnerSecret(req)) {
      return NextResponse.json({ error: 'Owner admin secret required.' }, { status: 401 });
    }
    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ error: 'Supabase admin not configured.' }, { status: 500 });
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'desk id is required.' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('desks')
      .update({ is_active: false })
      .eq('id', id)
      .eq('is_builtin', false); // never deactivate builtin desks

    if (error) throw error;
    return NextResponse.json({ deactivated: id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Could not deactivate desk.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
