import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function p1(topic: string, desk: string, lang: string) {
  return `You are an investigative research AI for Phong Daily Press v0.7.
TOPIC: ${topic}
DESK: ${desk}
LANGUAGE: ${lang}

Return a JSON object with these exact keys. Keep values SHORT (1-2 sentences max per field):
{
  "research_plan": {
    "topic": "one line restatement",
    "key_questions": ["question 1", "question 2", "question 3"],
    "scope": "what is in scope"
  },
  "background": {
    "summary": "2 sentences only",
    "current_status": "1 sentence"
  },
  "evidence_board": {
    "confirmed_facts": [
      {"claim": "fact", "source": "source", "reliability": "high"}
    ],
    "contradictions": [
      {"claim": "contradiction", "source": "source"}
    ]
  }
}

RULES: Output ONLY the JSON object. No markdown. No explanation. No extra text before or after.`;
}

function p2(topic: string, lang: string) {
  return `You are an investigative research AI for Phong Daily Press v0.7.
TOPIC: ${topic}
LANGUAGE: ${lang}

Return a JSON object. Keep values SHORT:
{
  "multi_view": {
    "view_a": {"label": "Mainstream view", "argument": "2 sentences"},
    "view_b": {"label": "Critical view", "argument": "2 sentences"},
    "view_c": {"label": "Alternative view", "argument": "2 sentences"},
    "blind_spot": "1 sentence — what everyone is missing"
  },
  "thesis_options": [
    {"id": 1, "core_argument": "thesis 1 in 1 sentence", "supporting_evidence": ["point 1", "point 2"]},
    {"id": 2, "core_argument": "thesis 2 in 1 sentence", "supporting_evidence": ["point 1"]},
    {"id": 3, "core_argument": "thesis 3 in 1 sentence", "supporting_evidence": ["point 1"]}
  ]
}

RULES: Output ONLY the JSON object. No markdown. No explanation. No extra text.`;
}

function pA(topic: string, thesis: string, mode: string, lang: string) {
  return `Write an article for Phong Daily Press v0.7.
TOPIC: ${topic}
THESIS: ${thesis}
MODE: ${mode}
LANGUAGE: ${lang}

Rules: Human voice. No AI clichés. Vietnamese must be culturally natural.

Return JSON only:
{
  "title": "article title",
  "subtitle": "lede",
  "body": "article text, use \\n\\n between paragraphs",
  "editors_note": ""
}

RULES: Output ONLY the JSON object. No markdown. No extra text.`;
}

function xj(raw: string) {
  let s = raw.trim();
  // Remove markdown fences
  s = s.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
  // Find JSON object boundaries
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a !== -1 && b > a) s = s.slice(a, b+1);
  return s;
}

async function callClaude(claude: Anthropic, prompt: string, tokens: number, tick: (p:number)=>void) {
  let text = '', n = 0;
  const est = tokens * 4;
  const st = claude.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: tokens,
    messages: [{ role: 'user', content: prompt }]
  });
  for await (const ch of st) {
    const c = ch as {type:string;delta?:{type:string;text:string}};
    if (c.type==='content_block_delta' && c.delta?.type==='text_delta' && c.delta.text) {
      text += c.delta.text;
      n += c.delta.text.length;
      if (n % 150 < c.delta.text.length) tick(Math.min(95, Math.round(n/est*100)));
    }
  }
  return text;
}

export async function POST(req: Request) {
  let body: Record<string,string>;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({error:'Invalid body.'}),{status:400,headers:{'Content-Type':'application/json'}}); }

  const {mode,topic,desk,language,thesis,evidenceBoard,articleMode,claudeKey} = body;
  const key = claudeKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return new Response(JSON.stringify({error:'No API key.'}),{status:400,headers:{'Content-Type':'application/json'}});
  if (!topic?.trim()) return new Response(JSON.stringify({error:'Topic required.'}),{status:400,headers:{'Content-Type':'application/json'}});

  const claude = new Anthropic({apiKey:key});
  const enc = new TextEncoder();
  const HDR = {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'};
  const sse = (o:object) => enc.encode(`data: ${JSON.stringify(o)}\n\n`);

  // Article mode
  if (mode === 'article') {
    const s = new ReadableStream({async start(ctl){
      try {
        ctl.enqueue(sse({type:'progress',pct:5,message:'Writing...'}));
        const raw = await callClaude(claude, pA(topic,thesis||'',articleMode||'Editorial',language||'Vietnamese'), 1200, p=>ctl.enqueue(sse({type:'progress',pct:p,message:`Writing ${p}%`})));
        const data = JSON.parse(xj(raw));
        ctl.enqueue(sse({type:'article',data}));
        ctl.enqueue(sse({type:'done'}));
      } catch(e:unknown){ ctl.enqueue(sse({type:'error',message:e instanceof Error?e.message:'Article failed.'})); }
      ctl.close();
    }});
    return new Response(s,{headers:HDR});
  }

  // Research mode
  const s = new ReadableStream({async start(ctl){
    const send = (o:object) => ctl.enqueue(sse(o));
    try {
      // Phase 1
      send({type:'status',message:'Phase 1: Research...'});
      const r1 = await callClaude(
        claude,
        p1(topic, desk||'Sports', language||'Vietnamese'),
        1000,
        p => send({type:'progress',pct:Math.round(p*0.45),message:`Research ${Math.round(p*0.45)}%`})
      );
      let ph1: Record<string,unknown> = {};
      try {
        ph1 = JSON.parse(xj(r1));
      } catch {
        // Try to send what we got as error info
        send({type:'error',message:`Phase 1 parse failed. Response was: ${r1.slice(0,200)}`});
        ctl.close();
        return;
      }
      for (const k of ['research_plan','background','evidence_board']) {
        if (ph1[k]) send({type:'section',section:k,data:ph1[k]});
      }

      // Phase 2
      send({type:'status',message:'Phase 2: Analysis...'});
      const r2 = await callClaude(
        claude,
        p2(topic, language||'Vietnamese'),
        1000,
        p => send({type:'progress',pct:45+Math.round(p*0.45),message:`Analysis ${45+Math.round(p*0.45)}%`})
      );
      let ph2: Record<string,unknown> = {};
      try {
        ph2 = JSON.parse(xj(r2));
      } catch {
        send({type:'error',message:`Phase 2 parse failed. Response was: ${r2.slice(0,200)}`});
        ctl.close();
        return;
      }
      for (const k of ['multi_view','thesis_options']) {
        if (ph2[k]) send({type:'section',section:k,data:ph2[k]});
      }

      send({type:'done',message:'Done. Select a thesis to write.'});
    } catch(e:unknown){
      send({type:'error',message:e instanceof Error?e.message:'Research failed.'});
    }
    ctl.close();
  }});
  return new Response(s,{headers:HDR});
}