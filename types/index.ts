// ═══════════════════════════════════════════════════════════════════
// PDP v0.6 — Shared TypeScript Types
// ═══════════════════════════════════════════════════════════════════

// ── Desks ────────────────────────────────────────────────────────────
export interface Desk {
  id: string;
  name: string;
  icon: string;
  desc: string;
  isBuiltin?: boolean;
}

// ── Writing DNA ───────────────────────────────────────────────────────
export interface WritingDNA {
  phrases: string[];          // signature phrases (comma-separated in UI)
  rhythm: string;             // sentence rhythm description
  paragraphLength: 'short' | 'medium' | 'long' | 'mixed';
  vocabulary: string[];       // common words/expressions
  emotionalStyle: string;     // cool/warm/dry/raw/etc
  narrativeStyle: string;     // anecdotal/analytical/lyrical/etc
  languageMix: string;        // Vietnamese-dominant/bilingual/etc
  avoidances: string[];       // phrases to avoid
}

// ── Author Voice Modes ────────────────────────────────────────────────
export type AuthorVoiceMode = 'raw' | 'polished' | 'editorial';

// ── Workflow Status ───────────────────────────────────────────────────
export type WorkflowStatus =
  | 'idea'
  | 'pitch'
  | 'assigned'
  | 'researching'
  | 'draft'
  | 'editing'
  | 'ready'
  | 'published'
  | 'archived';

// ── User Roles ────────────────────────────────────────────────────────
export type UserRole =
  | 'owner'
  | 'managing_editor'
  | 'editor'
  | 'reporter'
  | 'contributor';

// ── Billing ───────────────────────────────────────────────────────────
export type BillingMode = 'user_api_key' | 'owner_promo';

export interface BillingResult {
  claudeKey: string;
  billingMode: BillingMode;
  promoCode?: string;
  remaining?: number;
}

// ── Editorial Score ───────────────────────────────────────────────────
export interface EditorialScore {
  reader_value: string;
  originality: string;
  storytelling: string;
  human_authenticity: string;
  trust: string;
  mobile_readability: string;
}

// ── Social Pack ───────────────────────────────────────────────────────
export interface SocialPack {
  facebook_short: string;
  facebook_long: string;
  reel_script: string;
  comment_prompt: string;
}

// ── Generation Result ─────────────────────────────────────────────────
export interface GenerationResult {
  title: string;
  headlines: string[];
  vietnamese: string;
  english: string;
  captions: string[];
  hooks: string[];
  social_pack: SocialPack;
  hashtags: string[];
  editorial_score: EditorialScore;
  fact_check_notes: string[];
  publish_notes: string;
  ai_voice_warnings: string[];
  billing: {
    mode: BillingMode;
    engine: string;
    promo_code?: string;
    promo_remaining_generations?: number;
  };
}

// ── Post (from Supabase) ──────────────────────────────────────────────
export interface Post {
  id: string;
  user_id: string;
  title: string;
  desk: string;
  status: WorkflowStatus;
  writing_mode: AuthorVoiceMode;
  source_notes: string;
  vietnamese: string;
  english: string;
  captions: string;
  social_pack: SocialPack | null;
  score: EditorialScore | null;
  ai_voice_warnings: string[];
  fact_check_notes: string[];
  publish_notes: string;
  folder: string;
  tags: string[];
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

// ── Promo Code ────────────────────────────────────────────────────────
export interface PromoCode {
  code: string;
  plan_name: string;
  max_generations: number;
  used_generations: number;
  max_users: number;
  expires_at: string | null;
  is_active: boolean;
  notes: string;
  created_at: string;
  updated_at: string;
}

// ── User Profile ──────────────────────────────────────────────────────
export interface UserProfile {
  id: string;
  user_id: string;
  display_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── API Request Bodies ────────────────────────────────────────────────
export interface GenerateRequestBody {
  desk: string;
  mode: string;
  tone: string;
  audience: string;
  notes: string;
  writingMode: AuthorVoiceMode;
  writingDNA: WritingDNA;
  userClaudeKey: string;
  promoCode: string;
  userId?: string;
  userFingerprint: string;
}

export interface PromoCreateBody {
  plan_name?: string;
  max_generations?: number;
  max_users?: number;
  expires_at?: string | null;
  notes?: string;
  code?: string;
  prefix?: string;
}

export interface PromoUpdateBody {
  code: string;
  plan_name?: string;
  max_generations?: number;
  max_users?: number;
  expires_at?: string | null;
  is_active?: boolean;
  notes?: string;
}
