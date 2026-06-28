import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 30;
export const dynamic = 'force-dynamic';

const DESKS = ['Sports', 'Politics & Society', 'Wellness', 'Travel', 'Sinology'];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { desk, claudeKey } = body;

    const apiKey = claudeKey || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return Response.json({ error: 'No API key.' }, { status: 400 });
    }

    const targetDesk = DESKS.includes(desk) ? desk : 'Sports';

    const claude = new Anthropic({ apiKey });

    const response = await claude.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      messages: [{
        role: 'user',
        content: `You are the trend radar for Phong Daily Press Insight OS v0.7 — an investigative newsroom.

DESK: ${targetDesk}
TODAY: ${new Date().toISOString().split('T')[0]}

Generate 5 trending topics for the ${targetDesk} desk worth deep investigative research.
These should be stories with depth, contradiction, or underreported angles — not obvious headlines.

Output ONLY valid JSON:
{
  "desk": "${targetDesk}",
  "trends": [
    {
      "title": "story title",
      "why_it_matters": "2-3 sentences on significance and depth",
      "possible_angle": "the non-obvious investigative angle",
      "research_leads": "where to look, who to talk to, what data to find",
      "urgency": "high|medium|low",
      "complexity": "simple|moderate|complex"
    }
  ]
}`
      }]
    });

    const raw = response.content
      .filter((b: any) => b.type === 'text')
      .map((b: any) => b.text)
      .join('');

    const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const data = JSON.parse(cleaned);

    return Response.json(data);
  } catch (err: any) {
    return Response.json({ error: err?.message || 'Trending radar failed.' }, { status: 500 });
  }
}
