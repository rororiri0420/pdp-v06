import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function p1(topic: string, desk: string, lang: string, goal: string) {
  return `Investigative research AI for Phong Daily Press v0.7.\nTOPIC: ${topic}\nDESK: ${desk}\nLANGUAGE: ${lang}\nGOAL: ${goal}\nRules: No AI voice. Vietnamese must be natural. Every claim needs source.\nOutput ONLY valid compact JSON, no markdown, no extra text:\n{"research_plan":{"topic":"","key_questions":["","",""],"research_approach":"","scope":""},"background":{"summary":"","historical_context":"","current_status":""},"timeline":[{"date":"","event":"","significance":""}],"evidence_board":{"confirmed_facts":[{"claim":"","source":"","date":"","reliability":"high","notes":""}],"statistics":[{"claim":"","source":"","date":"","reliability":"high","notes":""}],"contradictions":[{"claim":"","source":"","date":"","reliability":"medium","notes":""}],"unknowns":[{"claim":"","source":"","date":"","reliability":"low","notes":""}]}}`;
}

function p2(topic: string, lang: string, ctx: string) {
  return `Investigative research AI for Phong Daily Press v0.7.\nTOPIC: ${topic}\nLANGUAGE: ${lang}\nCONTEXT: ${ctx}\nOutput ONLY valid compact JSON, no markdown, no extra text:\n{"fact_check":[{"claim":"","verdict":"Verified","explanation":""}],"multi_view":{"view_a":{"label":"Mainstream","argument":"","evidence":""},"view_b":{"label":"Critical","argument":"","evidence":""},"view_c":{"label":"Alternative","argument":"","evidence":""},"counterargument":"","unpopular_angle":"","blind_spot":""},"thesis_options":[{"id":1,"core_argument":"","supporting_evidence":["",""],"weaknesses":[""],"counterarguments":[""]},{"id":2,"core_argument":"","supporting_evidence":[""],"weaknesses":[""],"counterarguments":[""]},{"id":3,"core_argument":"","supporting_evidence":[""],"weaknesses":[""],"counterarguments":[""]}],"source_leads":[{"type":"person","name":"","why":""}]}`;
}

function pA(topic: string, thesis: string, ev: string, mode: string, lang: string) {
  return `Writing for Phong Daily Press v0.7. Human voice. No AI clichés.\nTOPIC: ${topic}\nTHESIS: ${thesis}\nMODE: ${mode}\nLANGUAGE: ${lang}\nEVIDENCE: ${ev}\nRules: every paragraph serves thesis. No generic conclusions. Vietnamese: culturally natural.\nOutput ONLY valid JSON:\n{"title":"","subtitle":"","body":"full article use \\n\\n for paragraphs","word_count":0,"key_claims":["",""],"editors_note":""}`;
}

function xj(raw: string) {
  let s = raw.replace(/^```json\s*/i,'').replace(/^```\s*/i,'').replace(/```\s*$/i,'').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a !== -1 && b > a) s = s.slice(a, b+1);
  return s;
}

async function callClaude(claude: Anthropic, prompt: string, tokens: number, tick: (p:number)=>void) {
  let text = '', n = 0;
  const est = tokens * 3.5;
  const st = claude.messages.stream({ model:'claude-sonnet-4-6', max_tokens:tokens, messages:[{role:'user',content:prompt}] });
  for await (const ch of st) {
    const c = ch as {type:string;delta?:{type:string;text:string}};
    if (c.type==='content_block_delta' && c.delta?.type==='text_delta' && c.delta.text) {
      text += c.delta.text;
      n += c.delta.text.length;
      if (n % 200 < c.delta.text.length) tick(Math.min(95, Math.round(n/est*100)));
    }
  }
  return text;
}

export async function POST(req: Request) {
  let body: Record<string,string>;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({error:'Invalid body.'}),{status:400,headers:{'Content-Type':'application/json'}}); }

  const {mode,topic,desk,language,outputGoal,thesis,evidenceBoard,articleMode,claudeKey} = body;
  const key = claudeKey || process.env.ANTHROPIC_API_KEY;
  if (!key) return new Response(JSON.stringify({error:'No API key.'}),{status:400,headers:{'Content-Type':'application/json'}});
  if (!topic?.trim()) return new Response(JSON.stringify({error:'Topic required.'}),{status:400,headers:{'Content-Type':'application/json'}});

  const claude = new Anthropic({apiKey:key});
  const enc = new TextEncoder();
  const HDR = {'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive','X-Accel-Buffering':'no'};
  const sse = (o:object) => enc.encode(`data: ${JSON.stringify(o)}\n\n`);

  if (mode === 'article') {
    const s = new ReadableStream({async start(ctl){
      try {
        ctl.enqueue(sse({type:'progress',pct:5,message:'Writing...'}));
        const raw = await callClaude(claude, pA(topic,thesis||'',evidenceBoard||'',articleMode||'Editorial',language||'Vietnamese'), 1500, p=>ctl.enqueue(sse({type:'progress',pct:p,message:`Writing ${p}%`})));
        const data = JSON.parse(xj(raw));
        ctl.enqueue(sse({type:'article',data}));
        ctl.enqueue(sse({type:'done'}));
      } catch(e:unknown){ ctl.enqueue(sse({type:'error',message:e instanceof Error?e.message:'Failed'})); }
      ctl.close();
    }});
    return new Response(s,{headers:HDR});
  }

  const s = new ReadableStream({async start(ctl){
    const send = (o:object) => ctl.enqueue(sse(o));
    try {
      send({type:'status',message:'Phase 1: Research...'});
      const r1 = await callClaude(
        claude,
        p1(topic,desk||'Sports',language||'Vietnamese',outputGoal||'investigative article'),
        800,
        p=>send({type:'progress',pct:Math.round(p*0.45),message:`Research ${Math.round(p*0.45)}%`})
      );
      let ph1: Record<string,unknown> = {};
      try { ph1 = JSON.parse(xj(r1)); }
      catch { send({type:'error',message:'Phase 1 failed. Try again.'}); ctl.close(); return; }
      for (const k of ['research_plan','background','timeline','evidence_board']) {
        if (ph1[k] !== undefined) send({type:'section',section:k,data:ph1[k]});
      }
      send({type:'status',message:'Phase 2: Analysis + thesis...'});
      const ctx = JSON.stringify({
        q: (ph1.research_plan as Record<string,unknown>)?.key_questions || [],
        f: ((ph1.evidence_board as Record<string,unknown[]>)?.confirmed_facts||[]).slice(0,2),
      });
      const r2 = await callClaude(
        claude,
        p2(topic,language||'Vietnamese',ctx),
        800,
        p=>send({type:'progress',pct:45+Math.round(p*0.45),message:`Analysis ${45+Math.round(p*0.45)}%`})
      );
      let ph2: Record<string,unknown> = {};
      try { ph2 = JSON.parse(xj(r2)); }
      catch { send({type:'error',message:'Phase 2 failed. Try again.'}); ctl.close(); return; }
      for (const k of ['fact_check','multi_view','thesis_options','source_leads']) {
        if (ph2[k] !== undefined) send({type:'section',section:k,data:ph2[k]});
      }
      send({type:'done',message:'Done. Select a thesis to write.'});
    } catch(e:unknown){ send({type:'error',message:e instanceof Error?e.message:'Research failed.'}); }
    ctl.close();
  }});
  return new Response(s,{headers:HDR});
}