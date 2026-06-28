import Anthropic from '@anthropic-ai/sdk';

// Vercel Hobby: 10s default. maxDuration = 60 requires Pro.
// Fix: use Anthropic's true SSE streaming so the HTTP connection stays alive
// while Claude generates. Each token arrives incrementally — no timeout.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

// ── Prompts ──────────────────────────────────────────────────────────────────
function buildResearchPrompt(
  topic: string,
  desk: string,
  language: string,
  depth: string,
  outputGoal: string
): string {
  const detailLevel = depth === 'deep'
    ? 'Comprehensive — include 6+ confirmed facts, 4+ statistics, full timeline, 3 thesis options.'
    : depth === 'standard'
    ? 'Standard — include 4+ confirmed facts, 2+ statistics, key timeline events, 3 thesis options.'
    : 'Quick — include 3 confirmed facts, 1-2 statistics, brief timeline, 3 thesis options.';

  return `You are an elite investigative research AI for Phong Daily Press — Insight OS v0.7.
One-person investigative newsroom. Depth, evidence, sharp original insight.

TOPIC: ${topic}
DESK: ${desk}
LANGUAGE: ${language}
DEPTH: ${detailLevel}
OUTPUT GOAL: ${outputGoal}

RULES:
- Every claim needs source/date/context. Never invent sources.
- Confirm vs speculate vs unknown — distinguish clearly.
- Surface contradictions. Do not hide complexity.
- No AI voice. No motivational filler. No generic summaries.
- Vietnamese: culturally natural, not translated English.
- Flag anything unverified.

Output ONLY valid JSON, no markdown, no preamble, no trailing text:
{
  "research_plan": {
    "topic": "restated precisely",
    "key_questions": ["3-5 core investigative questions"],
    "research_approach": "methodology in one sentence",
    "scope": "in scope / out of scope"
  },
  "background": {
    "summary": "2-3 paragraph factual background",
    "historical_context": "relevant history",
    "current_status": "where things stand now"
  },
  "timeline": [
    { "date": "YYYY-MM or YYYY", "event": "what happened", "significance": "why it matters" }
  ],
  "evidence_board": {
    "confirmed_facts": [
      { "claim": "fact", "source": "source name", "date": "date if known", "reliability": "high|medium|low", "notes": "context" }
    ],
    "statistics": [
      { "claim": "stat", "source": "source", "date": "date", "reliability": "high|medium|low", "notes": "caveats" }
    ],
    "expert_quotes": [
      { "claim": "quote or paraphrase", "source": "who said it", "date": "when", "reliability": "high|medium|low", "notes": "" }
    ],
    "contradictions": [
      { "claim": "the contradiction", "source": "sources involved", "date": "", "reliability": "medium", "notes": "what conflicts" }
    ],
    "unknowns": [
      { "claim": "what we do not know", "source": "", "date": "", "reliability": "low", "notes": "why it matters" }
    ],
    "needs_verification": [
      { "claim": "claim to verify", "source": "origin", "date": "", "reliability": "low", "notes": "how to verify" }
    ]
  },
  "fact_check": [
    { "claim": "specific claim", "verdict": "Verified|Plausible|Contradicted|Needs source", "explanation": "brief reasoning" }
  ],
  "multi_view": {
    "view_a": { "label": "Mainstream view", "argument": "...", "evidence": "..." },
    "view_b": { "label": "Critical view", "argument": "...", "evidence": "..." },
    "view_c": { "label": "Alternative view", "argument": "...", "evidence": "..." },
    "counterargument": "strongest argument against the most common position",
    "devils_advocate": "uncomfortable but valid contrary position",
    "unpopular_angle": "the angle most journalists will not take",
    "blind_spot": "what everyone is missing in this story — the most important overlooked dimension"
  },
  "thesis_options": [
    {
      "id": 1,
      "core_argument": "thesis statement",
      "supporting_evidence": ["evidence 1", "evidence 2", "evidence 3"],
      "weaknesses": ["weakness 1", "weakness 2"],
      "counterarguments": ["counterargument 1", "counterargument 2"]
    },
    {
      "id": 2,
      "core_argument": "alternative thesis",
      "supporting_evidence": ["evidence 1", "evidence 2"],
      "weaknesses": ["weakness 1"],
      "counterarguments": ["counterargument 1"]
    },
    {
      "id": 3,
      "core_argument": "contrarian thesis",
      "supporting_evidence": ["evidence 1", "evidence 2"],
      "weaknesses": ["weakness 1"],
      "counterarguments": ["counterargument 1"]
    }
  ],
  "related_angles": [
    { "angle": "story angle", "why_interesting": "brief reason", "research_leads": "where to look" }
  ],
  "source_leads": [
    { "type": "person|organization|document|database", "name": "name", "why": "what they would know" }
  ]
}`;
}

function buildArticlePrompt(
  topic: string,
  thesis: string,
  evidenceBoard: string,
  mode: string,
  language: string
): string {
  return `You are writing for Phong Daily Press — Insight OS v0.7.
Investigative newsroom for one person. Human voice. Sharp analysis. No AI clichés.

TOPIC: ${topic}
THESIS: ${thesis}
MODE: ${mode}
LANGUAGE: ${language}

EVIDENCE:
${evidenceBoard}

RULES:
- Every paragraph must serve the thesis argument.
- Cite sources naturally in text (not as footnotes).
- No generic conclusions. End on specific detail, open question, or implication.
- No "In conclusion". No "It is important to note". No "tapestry". No "journey".
- Vietnamese: culturally natural, not translated. Match register to desk.
- English: direct, specific, no corporate voice.

Output ONLY valid JSON:
{
  "title": "article title",
  "subtitle": "subtitle or lede",
  "body": "full article — use \\n\\n for paragraph breaks",
  "word_count": 0,
  "key_claims": ["3-5 main claims"],
  "editors_note": "anything to flag before publishing, or empty string"
}`;
}

// ── Helper: safe JSON extraction ──────────────────────────────────────────────
function extractJSON(raw: string): string {
  // Strip markdown fences
  let s = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
  // Find first { and last } to handle any trailing text
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    s = s.slice(start, end + 1);
  }
  return s;
}

// ── Main handler ──────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { mode, topic, desk, language, outputGoal, depth, thesis, evidenceBoard, articleMode, claudeKey } = body as Record<string, string>;

  const apiKey = claudeKey || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'No Anthropic API key. Add your key in the header.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!topic?.trim()) {
    return new Response(JSON.stringify({ error: 'Topic is required.' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const claude = new Anthropic({ apiKey });
  const encoder = new TextEncoder();

  function makeSSE(obj: object): Uint8Array {
    return encoder.encode(`data: ${JSON.stringify(obj)}\n\n`);
  }

  // ── ARTICLE MODE ────────────────────────────────────────────────────────────
  if (mode === 'article') {
    const prompt = buildArticlePrompt(
      topic,
      thesis || '',
      evidenceBoard || '',
      articleMode || 'Editorial',
      language || 'Vietnamese'
    );

    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Use true Anthropic streaming to keep connection alive
          let fullText = '';
          const anthropicStream = claude.messages.stream({
            model: 'claude-sonnet-4-6',
            max_tokens: 3000,
            messages: [{ role: 'user', content: prompt }],
          });

          // Send heartbeat while streaming to prevent proxy timeouts
          for await (const chunk of anthropicStream) {
            // Type narrowing for stream events
            const c = chunk as { type: string; delta?: { type: string; text: string } };
            if (c.type === 'content_block_delta' && c.delta?.type === 'text_delta' && c.delta.text) {
              fullText += c.delta.text;
              // Send progress ping every ~500 chars so connection stays alive
              if (fullText.length % 500 < 10) {
                controller.enqueue(makeSSE({ type: 'progress', chars: fullText.length }));
              }
            }
          }

          const cleaned = extractJSON(fullText);
          const data = JSON.parse(cleaned);
          controller.enqueue(makeSSE({ type: 'article', data }));
          controller.enqueue(makeSSE({ type: 'done' }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Article generation failed.';
          controller.enqueue(makeSSE({ type: 'error', message: msg }));
        }
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  }

  // ── DEEP RESEARCH MODE ──────────────────────────────────────────────────────
  const prompt = buildResearchPrompt(
    topic,
    desk || 'Editorial',
    language || 'Vietnamese',
    depth || 'standard',
    outputGoal || 'investigative article'
  );

  const stream = new ReadableStream({
    async start(controller) {
      function send(obj: object) {
        controller.enqueue(makeSSE(obj));
      }

      try {
        send({ type: 'status', message: 'Research engine starting...' });

        // TRUE STREAMING — connection stays alive, no timeout
        let fullText = '';
        let charCount = 0;

        const anthropicStream = claude.messages.stream({
          model: 'claude-sonnet-4-6',
          max_tokens: 4096,
          messages: [{ role: 'user', content: prompt }],
        });

        for await (const chunk of anthropicStream) {
          // Type narrowing for stream events
          const c = chunk as { type: string; delta?: { type: string; text: string } };
          if (c.type === 'content_block_delta' && c.delta?.type === 'text_delta' && c.delta.text) {
            fullText += c.delta.text;
            charCount += c.delta.text.length;

            // Send progress events so UI shows activity and connection stays alive
            if (charCount % 300 < c.delta.text.length) {
              const pct = Math.min(90, Math.round((charCount / 8000) * 100));
              send({ type: 'progress', pct, message: `Generating research... ${pct}%` });
            }
          }
        }

        // Full response received — now parse and stream sections
        send({ type: 'status', message: 'Parsing research...' });

        const cleaned = extractJSON(fullText);
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(cleaned);
        } catch {
          send({ type: 'error', message: 'Research returned invalid JSON. Try again with a more specific topic.' });
          controller.close();
          return;
        }

        // Stream sections in the exact order requested:
        // Research Plan → Evidence Board → Multi-view → Thesis → Source Leads
        const sectionOrder: string[] = [
          'research_plan',
          'background',
          'timeline',
          'evidence_board',
          'fact_check',
          'multi_view',
          'thesis_options',
          'related_angles',
          'source_leads',
        ];

        for (const key of sectionOrder) {
          if (parsed[key] !== undefined) {
            send({ type: 'section', section: key, data: parsed[key] });
          }
        }

        send({ type: 'done', message: 'Research complete. Select a thesis to write the article.' });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Research failed.';
        send({ type: 'error', message: msg });
      }

      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',   // disables nginx buffering on Vercel edge
    },
  });
}
