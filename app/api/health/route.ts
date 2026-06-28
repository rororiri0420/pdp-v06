import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks = {
    supabase_url: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    supabase_anon_key: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    supabase_service_role_key: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    anthropic_api_key: Boolean(process.env.ANTHROPIC_API_KEY),
    anthropic_model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5',
    owner_admin_secret: Boolean(process.env.OWNER_ADMIN_SECRET),
  };

  return NextResponse.json(
    {
      ok: true,
      service: 'Phong Daily Press',
      version: '0.6.1-json-hotfix',
      checks,
    },
    { headers: { 'content-type': 'application/json; charset=utf-8' } }
  );
}
