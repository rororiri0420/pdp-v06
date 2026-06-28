import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { resolveBilling, recordPromoUse } from '@/lib/billing';
import { buildSystemPrompt, buildUserPayload } from '@/lib/prompts';
import { FORBIDDEN_TERMS } from '@/lib/constants';
import type { GenerateRequestBody, WritingDNA } from '@/types';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function jsonError(message: string, status = 500, extra: Record<string, unknown> = {}) {
  return NextResponse.json(
    { ok: false, error: message, ...extra },
    { status, headers: { 'content-type': 'application/json; charset=utf-8' } }
  );
}

function jsonOk(payload: Record<string, unknown>) {
  return NextResponse.json(
    { ok: true, ...payload },
    { headers: { 'content-type': 'application/json; charset=utf-8' } }
  );
}

function getAnthropicModel() {
  return (process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5').trim();
}

function normalizeAnthropicError(err: unknown): string {
  if (err instanceof Error) {
    const message = err.message || 'Generation failed.';
    if (/model/i.test(message) && /not|invalid|exist|available|found/i.test(message)) {
      return `${message} Check ANTHROPIC_MODEL in Vercel/\.env.local and use a model available in your Anthropic account.`;
    }
    if (/credit|billing|payment|quota|overloaded|rate/i.test(message)) return message;
    return message;
  }
  return 'Generation failed.';
}

export async function POST(req: Request) {
  try {
    let body: GenerateRequestBody;
    try {
      body = (await req.json()) as GenerateRequestBody;
    } catch {
      return jsonError('Invalid request body. Expected JSON.', 400);
    }

    const { desk, mode, tone, audience, notes, writingMode = 'polished', writingDNA } = body;

    if (!notes || notes.trim().length < 5) {
      return jsonError('Add source notes before generating. At least a sentence or two.', 400);
    }

    const lowered = `${desk} ${notes}`.toLowerCase();
    if (FORBIDDEN_TERMS.some((w) => lowered.includes(w))) {
      return jsonError('Topic blocked by your public-content rules. Choose another angle.', 400);
    }

    const billing = await resolveBilling({
      userClaudeKey: body.userClaudeKey,
      promoCode: body.promoCode,
      userId: body.userId,
      userFingerprint: body.userFingerprint,
    });

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

    const model = getAnthropicModel();
    const claude = new Anthropic({ apiKey: billing.claudeKey });

    let response;
    try {
      response = await claude.messages.create({
        model,
        max_tokens: 4096,
        system: buildSystemPrompt(dna, writingMode),
        messages: [
          {
            role: 'user',
            content: buildUserPayload({ desk, mode, tone, audience, notes, voiceMode: writingMode }),
          },
        ],
      });
    } catch (err: unknown) {
      console.error('[PDP generate] Anthropic error:', err);
      return jsonError(normalizeAnthropicError(err), 502, { engine: model });
    }

    if (billing.billingMode === 'owner_promo') {
      await recordPromoUse(billing.promoCode);
    }

    const rawText = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      console.error('[PDP generate] JSON parse failed. Raw:', cleaned.slice(0, 1000));
      return jsonError('Claude returned text that was not valid JSON. Try again, or use a shorter prompt.', 502, {
        engine: model,
        raw_preview: cleaned.slice(0, 1000),
      });
    }

    return jsonOk({
      ...parsed,
      billing: {
        mode: billing.billingMode,
        engine: model,
        promo_code: billing.promoCode,
        promo_remaining_generations: billing.remaining,
      },
    });
  } catch (err: unknown) {
    console.error('[PDP generate] Unhandled error:', err);
    return jsonError(normalizeAnthropicError(err), 500);
  }
}

export async function GET() {
  return jsonOk({
    route: '/api/generate',
    status: 'ok',
    anthropic_key_configured: Boolean(process.env.ANTHROPIC_API_KEY),
    model: getAnthropicModel(),
  });
}
