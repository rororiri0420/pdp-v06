import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function p1(topic: string, desk: string, lang: string, goal: string) {
  return `Investigative research AI for Phong Daily Press v0.7.\nTOPIC: ${topic}\nDESK: ${desk}\nLANGUAGE: ${lang}\nGOAL: ${goal}\nOutput ONLY valid JSON, no markdown:\n{"research_plan":{"topic":"string","key_questions":["q1","q2","q3"],"research_approach":"string","scope":"string"},"background":{"summary":"string","historical_context":"string","current_status":"string"},"timeline":[{"date":"string","event":"string","significance":"string"}],"evidence_board":{"confirmed_facts":[{"claim":"string","source":"string","date":"string","reliability":"high","notes":"string"}],"statistics":[{"claim":"string","source":"string","date":"string","reliability":"high","notes":"string"}],"contradictions":[{"claim":"string","source":"string","date":"string","reliability":"medium","notes":"string"}],"unknowns":[{"claim":"string","source":"string","date":"string","reliability":"low","notes":"string"}]}}`;
}

function p2(topic: string, lang: string, ctx: string) {
  return `Investigative research AI for Phong Daily Press v0.7.\nTOPIC: ${topic}\nLANGUAGE: ${lang}\nCONTEXT: ${ctx}\nOutput ONLY valid JSON, no markdown:\n{"fact_check":[{"claim":"string","verdict":"Verified","explanation":"string"}],"multi_view":{"view_a":{"label":"Mainstream","argument":"string","evidence":"string"},"view_b":{"label":"Critical","argument":"string","evidence":"string"},"view_c":{"label":"Alternative","argument":"string","evidence":"string"},"counterargument":"string","unpopular_angle":"string","blind_spot":"string"},"thesis_options":[{"id":1,"core_argument":"string","supporting_evidence":["e1","e2"],"weaknesses":["w1"],"counterarguments":["c1"]},{"id":2,"core_argument":"string","supporting_evidence":["e1"],"weaknesses":["w1"],"counterarguments":["c1"]},{"id":3,"core_argument":"string","supporting_evidence":["e1"],"weaknesses":["w1"],"counterarguments":["c1"]}],"source_leads":[{"type":"person","name":"string","why":"string"}]}`;
}

function pA(topic: string, thesis: string, ev: string, mode: string, lang: string) {
  return `Writing for Phong Daily Press v0.7. Human voice. No AI clichés.\nTOPIC: ${topic}\nTHESIS: ${thesis}\nMODE: ${mode}\nLANGUAGE: ${lang}\nEVIDENCE: ${ev}\nRules: every paragraph serves thesis. No generic conclusions. Vietnamese: culturally natural.\nOutput ONLY valid JSON:\n{"title":"string","subtitle":"string","body":"full article with \\n\\n paragraph breaks","word_count":0,"key_claims":["c1","c2"],"editors_note":"string"}`;
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
      if (n % 250 < c.delta.text.length) tick(Math.min(95, Math.round(n/est*100)));
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
        const raw = await callClaude(claude, pA(topic,thesis||'',evidenceBoard||'',articleMode||'Editorial',language||'Vietnamese'), 2000, p=>ctl.enqueue(sse({type:'progress',pct:p,message:`Writing ${p}%`})));
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
      send({type:'status',message:'Phase 1: Research foundation...'});
      const r1 = await callClaude(claude, p1(topic,desk||'Editorial',language||'Vietnamese',outputGoal||'investigative article'), 2000, p=>send({type:'progress',pct:Math.round(p*0.45),message:`Phase 1... ${Math.round(p*0.45)}%`}));
      let ph1: Record<string,unknown> = {};
      try { ph1 = JSON.parse(xj(r1)); }
      catch { send({type:'error',message:'Phase 1 failed. Try a more specific topic.'}); ctl.close(); return; }
      for (const k of ['research_plan','background','timeline','evidence_board']) {
        if (ph1[k] !== undefined) send({type:'section',section:k,data:ph1[k]});
      }
      send({type:'status',message:'Phase 2: Analysis + thesis...'});
      const ctx = JSON.stringify({
        questions: (ph1.research_plan as Record<string,unknown>)?.key_questions || [],
        facts: ((ph1.evidence_board as Record<string,unknown[]>)?.confirmed_facts||[]).slice(0,3),
      });
      const r2 = await callClaude(claude, p2(topic,language||'Vietnamese',ctx), 2000, p=>send({type:'progress',pct:45+Math.round(p*0.45),message:`Phase 2... ${45+Math.round(p*0.45)}%`}));
      let ph2: Record<string,unknown> = {};
      try { ph2 = JSON.parse(xj(r2)); }
      catch { send({type:'error',message:'Phase 2 failed.'}); ctl.close(); return; }
      for (const k of ['fact_check','multi_view','thesis_options','source_leads']) {
        if (ph2[k] !== undefined) send({type:'section',section:k,data:ph2[k]});
      }
      send({type:'done',message:'Research complete. Select a thesis to write.'});
    } catch(e:unknown){ send({type:'error',message:e instanceof Error?e.message:'Research failed.'}); }
    ctl.close();
  }});
  return new Response(s,{headers:HDR});
}