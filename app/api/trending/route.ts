import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const DESKS = ['Sports', 'Politics & Society', 'Wellness', 'Travel', 'Sinology'];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { desk, claudeKey } = body;
    const apiKey = claudeKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return Response.json({ error: 'No API key.' }, { status: 400 });

    const targetDesk = DESKS.includes(desk) ? desk : 'Sports';
    const claude = new Anthropic({ apiKey });

    // Use streaming to keep connection alive
    let text = '';
    const st = claude.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      messages: [{
        role: 'user',
        content: `Trend radar for Phong Daily Press v0.7. DESK: ${targetDesk}
Generate 3 trending investigative story leads. Keep each field to 1 sentence.
Output ONLY valid JSON, no markdown:
{"desk":"${targetDesk}","trends":[{"title":"","why_it_matters":"","possible_angle":"","urgency":"high"},{"title":"","why_it_matters":"","possible_angle":"","urgency":"medium"},{"title":"","why_it_matters":"","possible_angle":"","urgency":"low"}]}`
      }]
    });

    for await (const ch of st) {
      const c = ch as { type: string; delta?: { type: string; text: string } };
      if (c.type === 'content_block_delta' && c.delta?.type === 'text_delta') {
        text += c.delta.text;
      }
    }

    const cleaned = text.replace(/^```json\s*/i,'').replace(/```\s*$/i,'').trim();
    const a = cleaned.indexOf('{'), b = cleaned.lastIndexOf('}');
    const json = a !== -1 && b > a ? cleaned.slice(a, b+1) : cleaned;
    const data = JSON.parse(json);
    return Response.json(data);

  } catch (err: unknown) {
    return Response.json({ error: err instanceof Error ? err.message : 'Trending failed.' }, { status: 500 });
  }
}