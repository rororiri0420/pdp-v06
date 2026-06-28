-- ═══════════════════════════════════════════════════════════════════════════
-- PDP v0.6 — Migration 001: Initial Schema
-- Run this on a fresh Supabase project via SQL Editor or Supabase CLI.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "uuid-ossp";

-- ── Shared trigger function ───────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── DESKS ─────────────────────────────────────────────────────────────────────
create table if not exists public.desks (
  id          text primary key,
  name        text        not null,
  description text        not null default '',
  is_builtin  boolean     not null default false,
  is_active   boolean     not null default true,
  created_by  uuid        references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

alter table public.desks enable row level security;
create policy "Active desks are publicly readable"
  on public.desks for select using (is_active = true);

-- Seed built-in desks
insert into public.desks (id, name, description, is_builtin) values
  ('travel',         'Travel',         '65 countries, culture, food, memory, place-based storytelling.',              true),
  ('wellness',       'Wellness',       'OMAD, meditation, discipline, recovery, longevity.',                          true),
  ('sports',         'Sports',         'Golf, table tennis, gym, performance, coaching, aging athlete.',              true),
  ('public-affairs', 'Public Affairs', 'U.S./Vietnam politics, society, law, public policy, social analysis.',       true),
  ('sinology',       'Sinology',       'Hán học, thành ngữ, điển tích, văn chương Trung Hoa.',                      true),
  ('memoir',         'Memoir',         'The Long Way Home, memory, failure, identity, comeback.',                     true),
  ('lifestyle',      'Lifestyle',      'Food, books, coffee, AI tools, productivity, everyday culture.',              true),
  ('editorial',      'Editorial',      'Long-form reflections, essays, arguments, weekly columns.',                   true),
  ('knowledge-lab',  'Knowledge Lab',  'Law, history, investing, philosophy, AI — explained as you learn.',          true)
on conflict (id) do nothing;

-- ── USER PROFILES ─────────────────────────────────────────────────────────────
create table if not exists public.user_profiles (
  id           uuid        primary key default uuid_generate_v4(),
  user_id      uuid        not null unique references auth.users(id) on delete cascade,
  display_name text        not null default '',
  role         text        not null default 'contributor'
                           check (role in ('owner','managing_editor','editor','reporter','contributor')),
  is_active    boolean     not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.user_profiles enable row level security;
create policy "Users can read own profile"
  on public.user_profiles for select using (auth.uid() = user_id);
create policy "Users can update own profile"
  on public.user_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at
  before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ── WRITING DNA ───────────────────────────────────────────────────────────────
create table if not exists public.writing_dna (
  id               uuid        primary key default uuid_generate_v4(),
  user_id          uuid        not null unique references auth.users(id) on delete cascade,
  phrases          text[]      not null default '{}',
  rhythm           text        not null default '',
  paragraph_length text        not null default 'medium'
                               check (paragraph_length in ('short','medium','long','mixed')),
  vocabulary       text[]      not null default '{}',
  emotional_style  text        not null default '',
  narrative_style  text        not null default '',
  language_mix     text        not null default '',
  avoidances       text[]      not null default '{}',
  sample_articles  uuid[]      not null default '{}',
  updated_at       timestamptz not null default now()
);

alter table public.writing_dna enable row level security;
create policy "Users can manage own writing DNA"
  on public.writing_dna for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists trg_writing_dna_updated_at on public.writing_dna;
create trigger trg_writing_dna_updated_at
  before update on public.writing_dna
  for each row execute function public.set_updated_at();

-- ── POSTS ─────────────────────────────────────────────────────────────────────
create table if not exists public.posts (
  id                 uuid        primary key default uuid_generate_v4(),
  user_id            uuid        not null references auth.users(id) on delete cascade,
  title              text        not null default 'Untitled',
  desk               text        not null,
  status             text        not null default 'idea'
                                 check (status in ('idea','pitch','assigned','researching','draft','editing','ready','published','archived')),
  writing_mode       text        not null default 'polished'
                                 check (writing_mode in ('raw','polished','editorial')),
  source_notes       text        not null default '',
  vietnamese         text        not null default '',
  english            text        not null default '',
  captions           text        not null default '[]',  -- JSON array string
  social_pack        jsonb       not null default '{}'::jsonb,
  score              jsonb       not null default '{}'::jsonb,
  ai_voice_warnings  jsonb       not null default '[]'::jsonb,
  fact_check_notes   jsonb       not null default '[]'::jsonb,
  publish_notes      text        not null default '',
  folder             text        not null default 'Inbox',
  tags               text[]      not null default '{}',
  is_favorite        boolean     not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.posts enable row level security;
create policy "Users can read own posts"
  on public.posts for select using (auth.uid() = user_id);
create policy "Users can insert own posts"
  on public.posts for insert with check (auth.uid() = user_id);
create policy "Users can update own posts"
  on public.posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own posts"
  on public.posts for delete using (auth.uid() = user_id);

drop trigger if exists trg_posts_updated_at on public.posts;
create trigger trg_posts_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- ── PROMO CODES ───────────────────────────────────────────────────────────────
create table if not exists public.promo_codes (
  code              text        primary key,
  plan_name         text        not null default 'Owner Sponsored Trial',
  max_generations   integer     not null default 20 check (max_generations >= 1),
  used_generations  integer     not null default 0  check (used_generations >= 0),
  max_users         integer     not null default 1  check (max_users >= 1),
  expires_at        timestamptz,
  is_active         boolean     not null default true,
  created_by_owner  boolean     not null default true,
  notes             text        not null default '',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- RLS enabled but no public policies — all access via service role only
alter table public.promo_codes enable row level security;

drop trigger if exists trg_promo_codes_updated_at on public.promo_codes;
create trigger trg_promo_codes_updated_at
  before update on public.promo_codes
  for each row execute function public.set_updated_at();

-- ── PROMO REDEMPTIONS ─────────────────────────────────────────────────────────
create table if not exists public.promo_redemptions (
  id               uuid        primary key default uuid_generate_v4(),
  promo_code       text        not null references public.promo_codes(code) on delete cascade,
  user_fingerprint text        not null,
  created_at       timestamptz not null default now(),
  unique (promo_code, user_fingerprint)
);

alter table public.promo_redemptions enable row level security;

-- ── PROMO USAGE EVENTS ────────────────────────────────────────────────────────
create table if not exists public.promo_usage_events (
  id          uuid        primary key default uuid_generate_v4(),
  promo_code  text        not null references public.promo_codes(code) on delete cascade,
  event_type  text        not null default 'generation',
  created_at  timestamptz not null default now()
);

alter table public.promo_usage_events enable row level security;

-- ── ATOMIC PROMO INCREMENT RPC ────────────────────────────────────────────────
-- Used by billing.ts to safely increment used_generations without race conditions.
-- The max_generations check is done inside the DB to prevent over-counting
-- when concurrent requests hit the same promo code simultaneously.
create or replace function public.increment_promo_usage(p_code text)
returns void
language plpgsql
security definer
as $$
begin
  update public.promo_codes
  set used_generations = used_generations + 1
  where code = p_code
    and is_active = true
    and used_generations < max_generations;
  -- If no row was updated (limit already reached), that is acceptable.
  -- The generation was already authorized in resolveBilling; this is just bookkeeping.
end;
$$;
