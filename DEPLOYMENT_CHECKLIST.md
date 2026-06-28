# PDP v0.6 — Deployment Checklist

## ① Local Development

### Prerequisites
- [ ] Node.js ≥ 18.x installed (`node --version`)
- [ ] npm ≥ 9.x installed (`npm --version`)
- [ ] Git installed

### Install & run
```bash
git clone <your-repo-url>
cd pdp-v06
npm install
cp .env.example .env.local
# Edit .env.local — see Section ② below
npm run dev
# → App runs at http://localhost:3000
```

### Verify dev server
- [ ] `npm run dev` starts without errors
- [ ] Browser opens `http://localhost:3000`
- [ ] Header shows "Phong Daily Press v0.6"
- [ ] All 4 tabs visible: Studio / Library / Writing DNA / Owner
- [ ] No console errors (F12 → Console)

### Verify build
```bash
npm run build
# Must complete with no TypeScript errors and no missing module errors.
npm run start
# Production server starts at http://localhost:3000
```

---

## ② Environment Variables

Copy `.env.example` to `.env.local` and fill in every value.

### Required for basic operation
| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → service_role secret |
| `OWNER_ADMIN_SECRET` | Generate: `openssl rand -hex 32` |

### Required for promo-mode generation (owner pays)
| Variable | Where to get it |
|---|---|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys |

### Optional
| Variable | Default |
|---|---|
| `ANTHROPIC_MODEL` | `claude-sonnet-4-5` |
| `OPENAI_API_KEY` | Not required. GPT features disabled without it. |

### Verify env vars
- [ ] All required vars present in `.env.local`
- [ ] No trailing spaces or quotes around values
- [ ] `OWNER_ADMIN_SECRET` is at least 32 characters

---

## ③ Supabase Setup

### New project (fresh install)
1. [ ] Create project at https://app.supabase.com
2. [ ] Go to SQL Editor
3. [ ] Paste and run `supabase/migrations/001_initial_schema.sql`
4. [ ] Verify: 7 tables created (desks, user_profiles, writing_dna, posts, promo_codes, promo_redemptions, promo_usage_events)
5. [ ] Verify: 9 built-in desks in `desks` table
6. [ ] Enable email magic link auth: Authentication → Providers → Email → Enable magic link

### Upgrading from v0.5
1. [ ] Run `supabase/migrations/002_migrate_from_v05.sql` in SQL Editor
2. [ ] Verify: posts table has new columns (writing_mode, social_pack, folder, tags, is_favorite, etc.)
3. [ ] Verify: desks, user_profiles, writing_dna tables exist

### Auth configuration
- [ ] Authentication → Email Templates → confirm the magic link template is active
- [ ] Authentication → URL Configuration → set Site URL to your domain
- [ ] Authentication → URL Configuration → add redirect URL: `https://your-domain.com/**`

### Row Level Security
- [ ] Verify RLS is enabled on all tables (Table Editor → each table → RLS badge)
- [ ] Test: a logged-out user cannot read posts in the SQL Editor using the anon key

---

## ④ Deployment (Vercel — recommended)

### One-time setup
```bash
npm install -g vercel
vercel login
```

### Deploy
```bash
vercel --prod
```

### Add environment variables in Vercel dashboard
1. [ ] Go to your project → Settings → Environment Variables
2. [ ] Add every variable from `.env.local`
3. [ ] Set environment to "Production" (and Preview if needed)
4. [ ] Redeploy after adding vars: `vercel --prod`

### Vercel-specific settings
- [ ] Framework preset: Next.js (auto-detected)
- [ ] Root directory: `/` (default)
- [ ] Build command: `npm run build` (default)
- [ ] Output directory: `.next` (default)
- [ ] Node.js version: 20.x (Vercel dashboard → Settings → General)

### Post-deploy verification
- [ ] Visit your Vercel URL
- [ ] Try sending a magic link email (requires Supabase auth configured)
- [ ] Try generating with your own Anthropic API key
- [ ] Verify the Owner Panel works with `OWNER_ADMIN_SECRET`
- [ ] Create one promo code and test it

---

## ⑤ Alternative Deployment (Netlify)

```bash
npm run build
# Netlify: set build command to "npm run build", publish dir to ".next"
# Requires @netlify/plugin-nextjs
```

Add to `netlify.toml`:
```toml
[build]
  command = "npm run build"
  publish = ".next"

[[plugins]]
  package = "@netlify/plugin-nextjs"
```

---

## ⑥ Pre-Launch Verification

### Studio tab
- [ ] Select a desk → desk highlights gold
- [ ] Select author voice mode → active state visible
- [ ] Add raw notes → Generate button activates
- [ ] Generation returns bilingual output + social pack + editorial score
- [ ] Anti-AI filter log appears when clichés were detected
- [ ] Copy buttons work for Vietnamese and English editions
- [ ] Save to Library succeeds (requires login)

### Library tab
- [ ] Saved posts appear in the grid
- [ ] Status filter works
- [ ] Desk filter works
- [ ] Search works (by title and notes)
- [ ] Favorite toggle works
- [ ] Status update from detail view works
- [ ] Delete with confirmation works

### Writing DNA tab
- [ ] All 8 fields editable
- [ ] Save DNA → success message
- [ ] DNA is read in next generation (check output reflects phrases/avoidances)

### Owner Panel tab
- [ ] Admin secret accepted
- [ ] Promo code created successfully
- [ ] Promo list loads
- [ ] Pause/activate toggle works
- [ ] Engine status card displays correctly

### Promo system
- [ ] Enter promo code in Studio → generations use owner API key
- [ ] Used generation count increments in Owner Panel
- [ ] Expired promo returns clear error
- [ ] User limit enforced

---

## ⑦ No Placeholder Files — Final Check

Run this to confirm no stubs remain:
```bash
grep -r "TODO\|FIXME\|placeholder\|your-project\|change-this" \
  --include="*.ts" --include="*.tsx" --include="*.sql" \
  . \
  --exclude-dir=node_modules \
  --exclude-dir=.next
```

Expected: only `.env.example` matches (intentional placeholder values).

---

## ⑧ Files Inventory

```
pdp-v06/
├── app/
│   ├── api/
│   │   ├── desks/route.ts
│   │   ├── generate/route.ts
│   │   ├── promo/
│   │   │   ├── create/route.ts
│   │   │   ├── delete/route.ts
│   │   │   ├── list/route.ts
│   │   │   └── update/route.ts
│   │   ├── users/route.ts
│   │   └── writing-dna/route.ts
│   ├── layout.tsx
│   ├── page.tsx
│   └── style.css
├── lib/
│   ├── billing.ts
│   ├── constants.ts
│   ├── prompts.ts
│   ├── supabaseAdmin.ts
│   └── supabaseClient.ts
├── public/
│   └── favicon.svg
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql
│       └── 002_migrate_from_v05.sql
├── types/
│   └── index.ts
├── .env.example
├── .gitignore
├── DEPLOYMENT_CHECKLIST.md
├── README.md
├── next-env.d.ts
├── next.config.mjs
├── package.json
└── tsconfig.json
```

Total: 26 files. Zero placeholder implementations.
