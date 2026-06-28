-- ═══════════════════════════════════════════════════════════════════════════
-- PDP v0.6 — Migration 002: Upgrade from v0.5
-- Run ONLY if you are upgrading an existing v0.5 project.
-- Safe to run multiple times (all statements use IF NOT EXISTS / DO NOTHING).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Create shared trigger function if missing ─────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ── Add new columns to posts ──────────────────────────────────────────────────
alter table public.posts
  add column if not exists writing_mode      text    not null default 'polished',
  add column if not exists social_pack       jsonb   not null default '{}'::jsonb,
  add column if not exists ai_voice_warnings jsonb   not null default '[]'::jsonb,
  add column if not exists fact_check_notes  jsonb   not null default '[]'::jsonb,
  add column if not exists publish_notes     text    not null default '',
  add column if not exists folder            text    not null default 'Inbox',
  add column if not exists tags              text[]  not null default '{}',
  add column if not exists is_favorite       boolean not null default false;

-- ── Expand status constraint ──────────────────────────────────────────────────
alter table public.posts
  drop constraint if exists posts_status_check;
alter table public.posts
  add constraint posts_status_check
  check (status in ('idea','pitch','assigned','researching','draft','editing','ready','published','archived'));

-- ── Create new tables (idempotent) ────────────────────────────────────────────

-- Desks
create table if not exists public.desks (
  id          text        primary key,
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

-- User profiles
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
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='user_profiles' and policyname='Users can read own profile'
  ) then
    create policy "Users can read own profile" on public.user_profiles for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where tablename='user_profiles' and policyname='Users can update own profile'
  ) then
    create policy "Users can update own profile" on public.user_profiles for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Writing DNA
create table if not exists public.writing_dna (
  id               uuid        primary key default uuid_generate_v4(),
  user_id          uuid        not null unique references auth.users(id) on delete cascade,
  phrases          text[]      not null default '{}',
  rhythm           text        not null default '',
  paragraph_length text        not null default 'medium',
  vocabulary       text[]      not null default '{}',
  emotional_style  text        not null default '',
  narrative_style  text        not null default '',
  language_mix     text        not null default '',
  avoidances       text[]      not null default '{}',
  sample_articles  uuid[]      not null default '{}',
  updated_at       timestamptz not null default now()
);
alter table public.writing_dna enable row level security;
do $$ begin
  if not exists (
    select 1 from pg_policies where tablename='writing_dna' and policyname='Users can manage own writing DNA'
  ) then
    create policy "Users can manage own writing DNA" on public.writing_dna for all
      using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- ── Triggers ──────────────────────────────────────────────────────────────────
drop trigger if exists trg_user_profiles_updated_at on public.user_profiles;
create trigger trg_user_profiles_updated_at before update on public.user_profiles for each row execute function public.set_updated_at();

drop trigger if exists trg_writing_dna_updated_at on public.writing_dna;
create trigger trg_writing_dna_updated_at before update on public.writing_dna for each row execute function public.set_updated_at();

-- ── Migrate old captions column (JSON string → keep as text, now also in jsonb social_pack) ──
-- No data migration needed: captions column stays as text (JSON string).
-- social_pack is a new column, defaults to {}.
-- Existing posts will have empty social_pack — that is correct.

-- ── Note on API key migration ─────────────────────────────────────────────────
-- v0.5 stored OpenAI keys under localStorage key 'pdp_user_openai_key'.
-- v0.6 stores Anthropic keys under 'pdp_claude_key'.
-- Users will need to re-enter their key on first login. No server-side action needed.

-- ── ATOMIC PROMO INCREMENT RPC (also in 001 for fresh installs) ───────────────
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
end;
$$;
