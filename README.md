# Phong Daily Press — v0.6
## Human-First AI Newsroom

> Human authenticity > speed > automation.
> The goal: *"This article could only have been written by this person."*

---

## Quick Start

```bash
git clone <repo-url>
cd pdp-v06
npm install
cp .env.example .env.local
# Fill in ANTHROPIC_API_KEY, Supabase keys, OWNER_ADMIN_SECRET
npm run dev
# → http://localhost:3000
```

---

## What Is This

PDP is a bilingual digital newsroom and publishing platform. It uses Claude as its writing brain to help you produce articles in a deeply human writing style — not generic AI prose.

The system builds a **Writing DNA profile** for each user (signature phrases, sentence rhythm, emotional register, language mixing preferences) and injects it into every generation request. Claude reads it before writing a single word.

An **Anti-AI Style Filter** runs before every output and rewrites clichés, motivational filler, corporate transitions, and over-polished symmetry. The filter log is returned alongside the article so you can see exactly what was changed.

---

## Architecture

```
Claude Sonnet 4.6   ─── Writing Brain
                        Long-form, memoir, editorial, essays,
                        Sinology, bilingual generation, storytelling

OpenAI GPT          ─── Operations Brain (optional)
                        Research, fact extraction, tagging,
                        analytics, structured outputs

Supabase            ─── Auth (magic link) + database
Next.js 15          ─── Full-stack (App Router + API routes)
```

---

## Features

### Production Studio
- 9 built-in desks + unlimited custom desks
- 3 Author Voice Modes: Raw / Polished / Editorial
- 8 Writing Modes (Quick Post → Newsroom Package)
- 6 Tones
- Anti-AI Style Filter (automatic, logged)
- Bilingual output: Vietnamese + English (not translations — culturally separate editions)
- Social pack: Facebook short/long, Reel script, Comment prompt
- Editorial score + Fact check notes + Publish notes

### Writing DNA
- Per-user voice profile: phrases, rhythm, paragraph length, vocabulary, emotional style, narrative approach, language mixing, avoidances
- Stored in localStorage + optionally synced to Supabase
- Read by Claude before every generation

### Library
- Private per-user article storage
- Folders: Inbox / Drafts / Published / Archive
- Tags, favorites, search
- Status management from library view (9-stage workflow)
- Inline detail panel with copy + status update + delete

### Promo System
- Owner creates codes with generation quota, user limit, expiry
- Users enter code to use owner API credits
- Usage tracked per code per user fingerprint
- Owner can activate / pause any code

### Owner Panel
- Create and manage promo codes
- Engine status (Claude primary, GPT optional)
- User management via `/api/users`

---

## Newsroom Workflow

```
idea → pitch → assigned → researching → draft → editing → ready → published → archived
```

---

## Desks

| Desk | Focus |
|---|---|
| Travel | 65 countries, culture, food, memory, place-based storytelling |
| Wellness | OMAD, meditation, discipline, recovery, longevity |
| Sports | Golf, table tennis, gym, performance, coaching, aging athlete |
| Public Affairs | U.S./Vietnam politics, society, law, public policy |
| Sinology | Hán học, thành ngữ, điển tích, văn chương Trung Hoa |
| Memoir | The Long Way Home, memory, failure, identity, comeback |
| Lifestyle | Food, books, coffee, AI tools, productivity |
| Editorial | Long-form reflections, essays, arguments, weekly columns |
| Knowledge Lab | Law, history, investing, philosophy, AI — explained as learned |
| Custom | Add unlimited custom desks |

---

## User Roles

`owner` · `managing_editor` · `editor` · `reporter` · `contributor`

Role enforcement via `user_profiles` table. Full RBAC in v0.7.

---

## Forbidden Topics

The following are permanently blocked (client-side + server-side):
USPS, postal service, postal routes, mail carrier operations.

---

## API Routes

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/generate` | POST | User key or promo | Generate article |
| `/api/promo/create` | POST | Owner secret | Create promo code |
| `/api/promo/list` | GET | Owner secret | List all promos |
| `/api/promo/update` | POST | Owner secret | Update promo |
| `/api/promo/delete` | POST | Owner secret | Delete promo |
| `/api/users` | GET/POST | Owner secret / user | User profiles |
| `/api/desks` | GET/POST/DELETE | Public / Owner secret | Desk management |
| `/api/writing-dna` | GET/POST | User | Writing DNA sync |

---

## Database Tables

| Table | Purpose |
|---|---|
| `posts` | User article drafts with full workflow and metadata |
| `writing_dna` | Per-user voice DNA profile |
| `user_profiles` | User roles and display names |
| `desks` | Built-in and custom desks |
| `promo_codes` | Owner-created generation credit codes |
| `promo_redemptions` | Per-user promo usage tracking |
| `promo_usage_events` | Event log for analytics |

---

## Billing Model

Each user pays for their own API usage via their Anthropic API key stored in `localStorage`.

Alternatively, the owner can create promo codes that use the owner's `ANTHROPIC_API_KEY` until the code's generation quota or expiry is reached.

---

## From v0.5 → v0.6: What Changed

- **Writing engine**: OpenAI → Anthropic Claude Sonnet 4.6
- **Writing DNA**: new per-user voice profile system
- **Author Voice Modes**: Raw / Polished / Editorial with strict prompting
- **Anti-AI filter**: automatic + logged in output
- **Workflow**: expanded to 9 stages (added pitch, assigned, researching, archived)
- **Library**: folders, tags, favorites, search, inline detail, status updates
- **Custom desks**: user-created desks stored locally
- **API routes**: 4 new routes (desks, users, writing-dna, promo/delete)
- **Type safety**: full TypeScript types in `types/index.ts`
- **Shared libs**: `lib/billing.ts`, `lib/constants.ts`, `lib/prompts.ts`
- **Schema**: 3 new tables, 8 new columns on posts
- **localStorage keys**: `pdp_claude_key` (was `pdp_user_openai_key`), `pdp_dna` (new)

---

## Deployment

See `DEPLOYMENT_CHECKLIST.md` for full step-by-step instructions.

**Recommended platform**: Vercel (zero-config Next.js deployment)

```bash
vercel --prod
```
