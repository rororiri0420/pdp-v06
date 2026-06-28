import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { resolveBilling, recordPromoUse } from '@/lib/billing';
import { buildSystemPrompt, buildUserPayload } from '@/lib/prompts';
import { FORBIDDEN_TERMS } from '@/lib/constants';
import type { GenerateRequestBody, WritingDNA } from '@/types';

export const maxDuration = 60; // seconds — allow time for long-form generation

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as GenerateRequestBody;
    const { desk, mode, tone, audience, notes, writingMode = 'polished', writingDNA } = body;

    // ── Input validation ──────────────────────────────────────────────
    if (!notes || notes.trim().length < 5) {
      return NextResponse.json(
        { error: 'Add source notes before generating. At least a sentence or two.' },
        { status: 400 }
      );
    }

    const lowered = `${desk} ${notes}`.toLowerCase();
    if (FORBIDDEN_TERMS.some((w) => lowered.includes(w))) {
      return NextResponse.json(
        { error: 'Topic blocked by your public-content rules. Choose another angle.' },
        { status: 400 }
      );
    }

    // ── Billing ───────────────────────────────────────────────────────
    const billing = await resolveBilling({
      userClaudeKey: body.userClaudeKey,
      promoCode: body.promoCode,
      userId: body.userId,
      userFingerprint: body.userFingerprint,
    });

    // ── Build DNA object ──────────────────────────────────────────────
    const dna: WritingDNA | undefined = writingDNA
      ? {
          phrases: writingDNA.phrases ?? [],
          rhythm: writingDNA.rhythm ?? '',
          paragraphLength: writingDNA.paragraphLength ?? 'medium',
          vocabulary: writingDNA.vocabulary ?? [],
          emotionalStyle: writingDNA.emotionalStyle ?? '',
          narrativeStyle: writingDNA.narrativeStyle ?? '',
          languageMix: writingDNA.languageMix ?? '',
          avoidances: writingDNA.avoidances ?? [],
        }
      : undefined;

    // ── Call Claude ───────────────────────────────────────────────────
    const claude = new Anthropic({ apiKey: billing.claudeKey });

    const response = await claude.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: buildSystemPrompt(dna, writingMode),
      messages: [
        {
          role: 'user',
          content: buildUserPayload({ desk, mode, tone, audience, notes, voiceMode: writingMode }),
        },
      ],
    });

    // ── Record promo usage ────────────────────────────────────────────
    if (billing.billingMode === 'owner_promo') {
      await recordPromoUse(billing.promoCode);
    }

    // ── Parse response ────────────────────────────────────────────────
    const rawText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    // Strip markdown fences if Claude wraps output
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[PDP generate] JSON parse failed. Raw:', cleaned.slice(0, 500));
      return NextResponse.json(
        { error: 'Generation returned malformed JSON. Try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ...parsed,
      billing: {
        mode: billing.billingMode,
        engine: process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-6',
        promo_code: billing.promoCode,
        promo_remaining_generations: billing.remaining,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Generation failed.';
    console.error('[PDP generate]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
