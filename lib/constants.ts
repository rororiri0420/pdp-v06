import type { Desk } from '@/types';

// ── Desks ─────────────────────────────────────────────────────────────────────
export const BUILTIN_DESKS: Desk[] = [
  { id: 'travel',         name: 'Travel',         icon: '✈', desc: '65 countries, culture, food, memory, place-based storytelling.', isBuiltin: true },
  { id: 'wellness',       name: 'Wellness',        icon: '◉', desc: 'OMAD, meditation, discipline, recovery, longevity.', isBuiltin: true },
  { id: 'sports',         name: 'Sports',          icon: '⚡', desc: 'Golf, table tennis, gym, performance, coaching, aging athlete.', isBuiltin: true },
  { id: 'public-affairs', name: 'Public Affairs',  icon: '⚖', desc: 'U.S./Vietnam politics, society, law, public policy, social analysis.', isBuiltin: true },
  { id: 'sinology',       name: 'Sinology',        icon: '字', desc: 'Hán học, thành ngữ, điển tích, văn chương Trung Hoa.', isBuiltin: true },
  { id: 'memoir',         name: 'Memoir',          icon: '◎', desc: 'The Long Way Home, memory, failure, identity, comeback.', isBuiltin: true },
  { id: 'lifestyle',      name: 'Lifestyle',       icon: '◈', desc: 'Food, books, coffee, AI tools, productivity, everyday culture.', isBuiltin: true },
  { id: 'editorial',      name: 'Editorial',       icon: '◐', desc: 'Long-form reflections, essays, arguments, weekly columns.', isBuiltin: true },
  { id: 'knowledge-lab',  name: 'Knowledge Lab',   icon: '△', desc: 'Law, history, investing, philosophy, AI — explained as you learn.', isBuiltin: true },
];

// ── Writing Modes ─────────────────────────────────────────────────────────────
export const WRITING_MODES = [
  'Quick Post',
  'Long Form',
  'Editorial',
  'Memoir',
  'Educational',
  'Caption Pack',
  'Reel Script',
  'Newsroom Package',
] as const;

// ── Tones ─────────────────────────────────────────────────────────────────────
export const TONES = [
  'Raw',
  'Poetic',
  'Journalistic',
  'Quiet & Deep',
  'Sharp Analysis',
  'Warm & Personal',
] as const;

// ── Workflow stages ───────────────────────────────────────────────────────────
export const WORKFLOW_STAGES = [
  'idea',
  'pitch',
  'assigned',
  'researching',
  'draft',
  'editing',
  'ready',
  'published',
  'archived',
] as const;

// ── Author Voice Modes ────────────────────────────────────────────────────────
export const AUTHOR_VOICE_MODES = [
  {
    id: 'raw' as const,
    label: 'Raw Author',
    desc: 'Preserve exact voice & imperfections. No smoothing.',
  },
  {
    id: 'polished' as const,
    label: 'Polished Author',
    desc: 'Fix grammar, keep personality & emotional register.',
  },
  {
    id: 'editorial' as const,
    label: 'Editorial Author',
    desc: 'Publication-ready. Author identity intact — no generic journalism.',
  },
];

// ── Library folders ───────────────────────────────────────────────────────────
export const LIBRARY_FOLDERS = ['Inbox', 'Drafts', 'Published', 'Archive'] as const;

// ── Forbidden topics (public content rule) ────────────────────────────────────
export const FORBIDDEN_TERMS = [
  'usps',
  'postal service',
  'post office',
  'mailman route',
  'carrier route',
  'city carrier',
] as const;

// ── Default Writing DNA ───────────────────────────────────────────────────────
export const DEFAULT_DNA_FORM = {
  phrases: '',
  rhythm: '',
  paragraphLength: 'medium' as const,
  vocabulary: '',
  emotionalStyle: '',
  narrativeStyle: '',
  languageMix: '',
  avoidances: '',
};

// NOTE: ANTHROPIC_MODEL is server-only (no NEXT_PUBLIC_ prefix).
// Do not reference process.env.ANTHROPIC_MODEL here — this file is imported
// by both client and server. Model name is resolved in lib/prompts.ts (server only).
