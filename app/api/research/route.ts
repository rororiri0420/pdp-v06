import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function p1(topic: string, desk: string, lang: string, goal: string) {
  return `Investigative research AI for Phong Daily Press v0.7.
TOPIC: ${topic}
DESK: ${desk}
LANGUAGE: ${lang}
GOAL: ${goal}
Rules: No AI voice. Vietnamese must be natural. Every claim needs source.
Output ONLY valid compact JSON, no markdown, no extra text:
{"research_plan":{"topic":"","key_questions":["","",""],"research_approach":"","scope":""},"background":{"summary":"","historical_context":"","current_status":""},"timeline":[{"date":"","event":"","significance":""}],"evidence_board":{"confirmed_facts":[{"claim":"","source":"","date":"","reliability":"high","notes":""}],"statistics":[{"claim":"","source":"","date":"","reliability":"high","notes":""}],"contradictions":[{"claim":"","source":"","date":"","reliability":"medium","notes":""}],"unknowns":[{"claim":"","source":"","date":"","reliability":"low","notes":""}]}}`;
}

function p2(topic: string, lang: string, ctx: string) {
  return `Investigative research AI for Phong Daily Press v0.7.
TOPIC: ${topic}
LANGUAGE: ${lang}
CONTEXT: ${ctx}
Output ONLY valid compact JSON, no markdown, no extra text:
{"fact_check":[{"claim":"","verdict":"Verified","explanation":""}],"multi_view":{"view_a":{"label":"Mainstream","argument":"","evidence":""},"view_b":{"label":"Critical","argument":"","evidence":""},"view_c":{"label":"Alternative","argument":"","evidence":""},"counterargument":"","unpopular_angle":"","blind_spot":""},"thesis_options":[{"id":1,"core_argument":"","supporting_evidence":["",""],"weaknesses":[""],"counterarguments":[""]},{"id":2,"core_argument":"","supporting_evidence":[""],"weaknesses":[""],"counterarguments":[""]},{"id":3,"core_argument":"","supporting_evidence":[""],"weaknesses":[""],"counterarguments":[""]}],"source_leads":[{"type":"person","name":"","why":""}]}`;
}

function xj(raw: string) {
  let s = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a !== -1 && b > a) s = s.slice(a, b+1);
  return s;
}

async function callClaude(claude: Anthropic, prompt: string, tokens: number, label: string, tick: (p:number)=>void) {
  console.log(`[${label}] claude call starting, max_tokens=${tokens}`);
  let text = '', n = 0;
  const est = tokens * 3.5;
  const st = claude.messages.stream({ model:'claude-sonnet-4-6', max_tokens:tokens, messages:[{role:'user',content:prompt}] });
  let chunkCount = 0;
  for await (const ch of st) {
    const c = ch as {type:string;delta?:{type:string;text:string}};
    if (c.type==='content_block_delta' && c.delta?.type==='text_delta' && c.delta.text) {
      text += c.delta.text;
      n += c.delta.text.length;
      chunkCount++;
      if (chunkCount === 1) console.log(`[${label}] first token received from Claude`);
      if (n % 200 < c.delta.text.length) tick(Math.min(95, Math.round(n/est*100)));
    }
  }
  console.log(`[${label}] claude finished. total chars=${n}, chunks=${chunkCount}`);
  return text;
}

export async function POST(req: Request) {
  console.log('[route] request received');

  let body: Record<string,string>;
  try { body = await req.json(); }
  catch {
    console.log('[route] JSON parse failed');
    return new Response(JSON.stringify({error:'Invalid body.'}),{status:400,headers:{'Content-Type':'application/json'}});
  }

  console.log(`[route] mode=${body.mode} topic=${body.topic?.slice(0,40)}`);

  const {mode,topic,desk,language,outputGoal,thesis,evidenceBoard,articleMode,claudeKey} = body;
  const key = claudeKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return new Response(JSON.stringify({error:'No API key.'}),{status:400,headers:{'Content-Type':'application/json'}});
  if (!topic?.trim()) return new Response(JSON.stringify({error:'Topic required.'}),{status:400,headers:{'Content-Type':'application/json'}});

  const claude = new Anthropic({apiKey:key});
  const enc = new TextEncoder();
  const HDR = {
    'Content-Type':'text/event-stream',
    'Cache-Control':'no-cache',
    'Connection':'keep-alive',
    'X-Accel-Buffering':'no',
  };
  const sse = (o:object) => enc.encode(`data: ${JSON.stringify(o)}\n\n`);

  // ── RESEARCH MODE ──────────────────────────────────────────────────────────
  console.log('[route] opening stream');
  const s = new ReadableStream({
    async start(ctl){
      const send = (o:object) => {
        ctl.enqueue(sse(o));
      };

      try {
        console.log('[stream] stream opened — sending first status event');
        send({type:'status',message:'Phase 1: Research...'});
        console.log('[stream] first SSE event sent to browser');

        const r1 = await callClaude(
          claude,
          p1(topic, desk||'Sports', language||'Vietnamese', outputGoal||'investigative article'),
          800,
          'phase1',
          p => send({type:'progress',pct:Math.round(p*0.45),message:`Research ${Math.round(p*0.45)}%`})
        );

        console.log('[stream] phase1 raw length=', r1.length);

        let ph1: Record<string,unknown> = {};
        try {
          ph1 = JSON.parse(xj(r1));
          console.log('[stream] phase1 JSON parsed OK, keys=', Object.keys(ph1).join(','));
        } catch(parseErr) {
          console.log('[stream] phase1 JSON parse FAILED:', String(parseErr));
          console.log('[stream] raw preview:', r1.slice(0,200));
          send({type:'error',message:'Phase 1 JSON parse failed. Raw: '+r1.slice(0,100)});
          ctl.close();
          return;
        }

        for (const k of ['research_plan','background','timeline','evidence_board']) {
          if (ph1[k] !== undefined) {
            console.log(`[stream] sending section: ${k}`);
            send({type:'section',section:k,data:ph1[k]});
          }
        }

        console.log('[stream] phase1 sections sent — starting phase2');
        send({type:'status',message:'Phase 2: Analysis + thesis...'});

        const ctx = JSON.stringify({
          q: (ph1.research_plan as Record<string,unknown>)?.key_questions || [],
          f: ((ph1.evidence_board as Record<string,unknown[]>)?.confirmed_facts||[]).slice(0,2),
        });

        const r2 = await callClaude(
          claude,
          p2(topic, language||'Vietnamese', ctx),
          800,
          'phase2',
          p => send({type:'progress',pct:45+Math.round(p*0.45),message:`Analysis ${45+Math.round(p*0.45)}%`})
        );

        console.log('[stream] phase2 raw length=', r2.length);

        let ph2: Record<string,unknown> = {};
        try {
          ph2 = JSON.parse(xj(r2));
          console.log('[stream] phase2 JSON parsed OK, keys=', Object.keys(ph2).join(','));
        } catch(parseErr) {
          console.log('[stream] phase2 JSON parse FAILED:', String(parseErr));
          send({type:'error',message:'Phase 2 JSON parse failed. Raw: '+r2.slice(0,100)});
          ctl.close();
          return;
        }

        for (const k of ['fact_check','multi_view','thesis_options','source_leads']) {
          if (ph2[k] !== undefined) {
            console.log(`[stream] sending section: ${k}`);
            send({type:'section',section:k,data:ph2[k]});
          }
        }

        console.log('[stream] all sections sent — sending done');
        send({type:'done',message:'Done. Select a thesis to write.'});

      } catch(e:unknown) {
        console.log('[stream] UNCAUGHT ERROR:', e instanceof Error ? e.message : String(e));
        send({type:'error',message:e instanceof Error?e.message:'Research failed.'});
      }

      console.log('[stream] closing controller');
      ctl.close();
    },
  });

  console.log('[route] returning stream response');
  return new Response(s,{headers:HDR});
}