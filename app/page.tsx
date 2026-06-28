'use client';

import { useCallback, useEffect, useState } from 'react';

type Tab = 'research' | 'radar';
type Depth = 'quick' | 'standard' | 'deep';
type ArticleMode = 'Facebook Article' | 'Long-form Essay' | 'Editorial' | 'Opinion' | 'Bilingual';
type SectionKey = 'research_plan' | 'background' | 'timeline' | 'evidence_board' | 'fact_check' | 'multi_view' | 'thesis_options' | 'related_angles' | 'source_leads' | 'article';

const DESKS = ['Sports', 'Politics & Society', 'Wellness', 'Travel', 'Sinology', 'Editorial', 'Technology', 'Culture'];
const LANGUAGES = ['Vietnamese', 'English', 'Bilingual (VN + EN)'];
const DEPTHS: { id: Depth; label: string; desc: string }[] = [
  { id: 'quick',    label: 'Quick',    desc: '~30s' },
  { id: 'standard', label: 'Standard', desc: '~45s' },
  { id: 'deep',     label: 'Deep',     desc: '~60s' },
];
const ARTICLE_MODES: ArticleMode[] = ['Facebook Article', 'Long-form Essay', 'Editorial', 'Opinion', 'Bilingual'];
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: 'research_plan',  label: 'Research Plan' },
  { key: 'background',     label: 'Background' },
  { key: 'timeline',       label: 'Timeline' },
  { key: 'evidence_board', label: 'Evidence Board' },
  { key: 'fact_check',     label: 'Fact Check' },
  { key: 'multi_view',     label: 'Multi-View' },
  { key: 'thesis_options', label: 'Thesis Options' },
  { key: 'source_leads',   label: 'Source Leads' },
];

function reliabilityClass(r: string) {
  if (!r) return 'reliability-medium';
  const l = r.toLowerCase();
  if (l === 'high') return 'reliability-high';
  if (l === 'low')  return 'reliability-low';
  return 'reliability-medium';
}

function verdictBadgeClass(v: string) {
  if (!v) return '';
  const l = v.toLowerCase().replace(/\s+/g, '-');
  if (l === 'verified') return 'badge-confirmed';
  if (l === 'plausible') return 'badge-plausible';
  if (l === 'contradicted') return 'badge-contradicted';
  return 'badge-needs-source';
}

export default function Home() {
  const [tab, setTab] = useState<Tab>('research');
  const [claudeKey, setClaudeKey] = useState('');
  const [keyInput, setKeyInput] = useState('');
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'error' | 'success' | 'info'>('info');

  // Topic intake
  const [topic, setTopic] = useState('');
  const [desk, setDesk] = useState('Sports');
  const [language, setLanguage] = useState('Vietnamese');
  const [outputGoal, setOutputGoal] = useState('investigative article');
  const [depth, setDepth] = useState<Depth>('standard');

  // Research state
  const [loading, setLoading] = useState(false);
  const [streamPhase, setStreamPhase] = useState('');
  const [sections, setSections] = useState<Partial<Record<SectionKey, any>>>({});
  const [readySections, setReadySections] = useState<SectionKey[]>([]);
  const [activeSection, setActiveSection] = useState<SectionKey>('research_plan');

  // Thesis + article
  const [selectedThesis, setSelectedThesis] = useState<number | null>(null);
  const [articleMode, setArticleMode] = useState<ArticleMode>('Editorial');
  const [article, setArticle] = useState<any>(null);
  const [writingArticle, setWritingArticle] = useState(false);

  // Trending
  const [trendDesk, setTrendDesk] = useState('Sports');
  const [trends, setTrends] = useState<any[]>([]);
  const [loadingTrends, setLoadingTrends] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem('pdp_claude_key');
    if (saved) setClaudeKey(saved);
  }, []);

  function notify(m: string, t: 'error' | 'success' | 'info' = 'info') {
    setMsg(m); setMsgType(t);
    if (t !== 'error') setTimeout(() => setMsg(''), 5000);
  }

  function saveKey() {
    const k = keyInput.trim();
    if (!k.startsWith('sk-ant-')) return notify('Invalid key — must start with sk-ant-', 'error');
    localStorage.setItem('pdp_claude_key', k);
    setClaudeKey(k);
    setKeyInput('');
    notify('API key saved.', 'success');
  }

  function clearKey() {
    localStorage.removeItem('pdp_claude_key');
    setClaudeKey('');
  }

  // ── Deep Research ──────────────────────────────────────────────────────────
  const runResearch = useCallback(async () => {
    if (!topic.trim()) return notify('Enter a topic first.', 'error');
    if (!claudeKey) return notify('Add your Anthropic API key above.', 'error');

    setLoading(true);
    setSections({});
    setReadySections([]);
    setArticle(null);
    setSelectedThesis(null);
    setStreamPhase('Connecting to research engine...');

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'research', topic, desk, language, outputGoal, depth, claudeKey }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }));
        throw new Error(err.error || 'Research failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;

          try {
            const event = JSON.parse(payload);
            if (event.type === 'status' || event.type === 'progress') {
              setStreamPhase(event.message || `Generating... ${event.pct || 0}%`);
            } else if (event.type === 'section') {
              const key = event.section as SectionKey;
              setSections(prev => ({ ...prev, [key]: event.data }));
              setReadySections(prev => prev.includes(key) ? prev : [...prev, key]);
              setActiveSection(key);
              setStreamPhase(`${key.replace(/_/g, ' ')} ready`);
            } else if (event.type === 'done') {
              setStreamPhase('Research complete.');
            } else if (event.type === 'error') {
              throw new Error(event.message);
            }
          } catch (parseErr) {
            // skip malformed line
          }
        }
      }
    } catch (err: any) {
      notify(err.message || 'Research failed.', 'error');
    } finally {
      setLoading(false);
      setStreamPhase('');
    }
  }, [topic, desk, language, outputGoal, depth, claudeKey]);

  // ── Write Article ──────────────────────────────────────────────────────────
  async function writeArticle() {
    if (selectedThesis === null) return notify('Select a thesis first.', 'error');
    if (!claudeKey) return notify('Add your Anthropic API key.', 'error');

    const thesis = sections.thesis_options?.[selectedThesis];
    if (!thesis) return notify('Thesis not found.', 'error');

    setWritingArticle(true);
    setArticle(null);

    const evidenceSummary = JSON.stringify({
      confirmed: sections.evidence_board?.confirmed_facts?.slice(0, 5) || [],
      stats: sections.evidence_board?.statistics?.slice(0, 4) || [],
      quotes: sections.evidence_board?.expert_quotes?.slice(0, 3) || [],
    });

    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'article',
          topic,
          thesis: thesis.core_argument,
          evidenceBoard: evidenceSummary,
          articleMode,
          language,
          claudeKey,
        }),
      });

      if (!res.ok || !res.body) throw new Error('Article generation failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') break;
          try {
            const event = JSON.parse(payload);
            if (event.type === 'article') { setArticle(event.data); setActiveSection('article'); }
            if (event.type === 'error') throw new Error(event.message);
          } catch {}
        }
      }
    } catch (err: any) {
      notify(err.message || 'Article generation failed.', 'error');
    } finally {
      setWritingArticle(false);
    }
  }

  // ── Trending ───────────────────────────────────────────────────────────────
  async function fetchTrends() {
    if (!claudeKey) return notify('Add your Anthropic API key.', 'error');
    setLoadingTrends(true);
    setTrends([]);
    try {
      const res = await fetch('/api/trending', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ desk: trendDesk, claudeKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Trending failed');
      setTrends(data.trends || []);
    } catch (err: any) {
      notify(err.message, 'error');
    } finally {
      setLoadingTrends(false);
    }
  }

  function loadTrendTopic(trend: any) {
    setTopic(trend.title);
    setDesk(trendDesk);
    setOutputGoal('investigative article');
    setTab('research');
    notify(`Topic loaded: ${trend.title}`, 'success');
  }

  function copyText(text: string) {
    navigator.clipboard.writeText(text || '');
    notify('Copied.', 'info');
  }

  const hasResearch = readySections.length > 0;

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* HEADER */}
      <header className="header">
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div className="logo">
            <span className="logo-mark">P</span>
            <div>
              <span className="logo-name">Phong Daily Press</span>
              <span className="logo-version">Insight OS · v0.7</span>
            </div>
          </div>
          <nav className="nav">
            <button className={`nav-btn${tab === 'research' ? ' active' : ''}`} onClick={() => setTab('research')}>◈ Research</button>
            <button className={`nav-btn${tab === 'radar' ? ' active' : ''}`} onClick={() => setTab('radar')}>◉ Trending Radar</button>
          </nav>
        </div>
        <div className="header-right">
          {claudeKey ? (
            <>
              <span className="api-status api-ok">API ✓</span>
              <button className="btn-sm" onClick={clearKey}>Remove key</button>
            </>
          ) : (
            <>
              <input className="key-input" type="password" placeholder="sk-ant-... API key" value={keyInput} onChange={(e: any) => setKeyInput(e.target.value)} onKeyDown={(e: any) => e.key === 'Enter' && saveKey()} />
              <button className="btn-sm" onClick={saveKey}>Save key</button>
            </>
          )}
        </div>
      </header>

      {msg && (
        <div className={`banner banner-${msgType}`} style={{ margin: '12px 24px 0' }} onClick={() => setMsg('')}>
          {msg}
        </div>
      )}

      <div className="main">

        {/* ══ RESEARCH TAB ══════════════════════════════════════════════════ */}
        {tab === 'research' && (
          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>

            {/* Left: Topic Intake */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="panel">
                <div className="panel-title">Topic Intake</div>

                <label>Topic</label>
                <textarea
                  value={topic}
                  onChange={(e: any) => setTopic(e.target.value)}
                  placeholder="What do you want to investigate? Be specific."
                  style={{ minHeight: 80 }}
                />

                <div className="intake-grid">
                  <div>
                    <label>Desk</label>
                    <select value={desk} onChange={(e: any) => setDesk(e.target.value)}>
                      {DESKS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label>Language</label>
                    <select value={language} onChange={(e: any) => setLanguage(e.target.value)}>
                      {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                </div>

                <label>Output Goal</label>
                <input value={outputGoal} onChange={(e: any) => setOutputGoal(e.target.value)} placeholder="investigative article, explainer, op-ed..." />

                <label>Research Depth</label>
                <div className="depth-selector">
                  {DEPTHS.map(d => (
                    <button key={d.id} className={`depth-btn${depth === d.id ? ' active' : ''}`} onClick={() => setDepth(d.id)}>
                      {d.label}<br /><span style={{ fontSize: 10 }}>{d.desc}</span>
                    </button>
                  ))}
                </div>

                <button className="btn-primary" onClick={runResearch} disabled={loading}>
                  {loading ? 'Researching...' : '◈ Deep Research'}
                </button>
              </div>

              {/* Article generator — shows after research */}
              {hasResearch && (
                <div className="panel">
                  <div className="panel-title">Write Article</div>

                  <label>Article Mode</label>
                  <div className="article-modes">
                    {ARTICLE_MODES.map(m => (
                      <button key={m} className={`article-mode-btn${articleMode === m ? ' active' : ''}`} onClick={() => setArticleMode(m)}>
                        {m}
                      </button>
                    ))}
                  </div>

                  {sections.thesis_options ? (
                    <>
                      <label>Select Thesis</label>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                        {sections.thesis_options.map((t: any, i: number) => (
                          <button
                            key={i}
                            className={`thesis-card${selectedThesis === i ? ' selected' : ''}`}
                            onClick={() => setSelectedThesis(i)}
                            style={{ textAlign: 'left', width: '100%' }}
                          >
                            <div className="thesis-number">Thesis {i + 1}</div>
                            <div style={{ fontSize: 12, color: 'var(--press)', lineHeight: 1.4 }}>{t.core_argument}</div>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 8 }}>Run research first to unlock thesis options.</p>
                  )}

                  <button
                    className="btn-primary"
                    onClick={writeArticle}
                    disabled={writingArticle || selectedThesis === null}
                    style={{ marginTop: 12 }}
                  >
                    {writingArticle ? 'Writing...' : '✏ Write Article'}
                  </button>
                </div>
              )}
            </div>

            {/* Right: Research Output */}
            <div>
              {loading && (
                <div className="stream-status">
                  <div className="pulse" />
                  <span className="stream-status-text">{streamPhase || 'Research in progress...'}</span>
                </div>
              )}

              {!hasResearch && !loading && (
                <div className="panel">
                  <div className="empty-state">
                    <span className="empty-icon">◈</span>
                    <p>Enter a topic and run Deep Research.</p>
                    <p style={{ fontSize: 12 }}>Research plan · Evidence board · Fact check · Multi-view · Thesis options · Article</p>
                  </div>
                </div>
              )}

              {hasResearch && (
                <>
                  {/* Section tabs */}
                  <div className="section-tabs">
                    {SECTIONS.map(s => (
                      readySections.includes(s.key) && (
                        <button
                          key={s.key}
                          className={`section-tab ready${activeSection === s.key ? ' active' : ''}`}
                          onClick={() => setActiveSection(s.key)}
                        >
                          {s.label}
                        </button>
                      )
                    ))}
                    {article && (
                      <button
                        className={`section-tab ready${activeSection === 'article' ? ' active' : ''}`}
                        onClick={() => setActiveSection('article')}
                      >
                        ✏ Article
                      </button>
                    )}
                  </div>

                  {/* Section content */}
                  <div className="panel">

                    {/* Research Plan */}
                    {activeSection === 'research_plan' && sections.research_plan && (
                      <div>
                        <div className="section-header"><span className="section-label">Research Plan</span></div>
                        <p style={{ fontSize: 14, color: 'var(--press)', marginBottom: 12 }}><strong>Scope:</strong> {sections.research_plan.scope}</p>
                        <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>{sections.research_plan.research_approach}</p>
                        <div className="section-label" style={{ marginBottom: 8 }}>Key Questions</div>
                        <div className="key-questions">
                          {(sections.research_plan.key_questions || []).map((q: string, i: number) => (
                            <div key={i} className="key-question">{q}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Background */}
                    {activeSection === 'background' && sections.background && (
                      <div>
                        <div className="section-header"><span className="section-label">Background</span></div>
                        <p style={{ fontSize: 14, color: 'var(--press)', lineHeight: 1.7, marginBottom: 14 }}>{sections.background.summary}</p>
                        {sections.background.historical_context && (
                          <><div className="section-label" style={{ marginBottom: 6 }}>Historical Context</div>
                          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6, marginBottom: 12 }}>{sections.background.historical_context}</p></>
                        )}
                        {sections.background.current_status && (
                          <><div className="section-label" style={{ marginBottom: 6 }}>Current Status</div>
                          <p style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.6 }}>{sections.background.current_status}</p></>
                        )}
                      </div>
                    )}

                    {/* Timeline */}
                    {activeSection === 'timeline' && sections.timeline && (
                      <div>
                        <div className="section-header"><span className="section-label">Timeline</span></div>
                        <div className="timeline">
                          {sections.timeline.map((item: any, i: number) => (
                            <div key={i} className="timeline-item">
                              <div className="timeline-date">{item.date}</div>
                              <div>
                                <div className="timeline-event">{item.event}</div>
                                {item.significance && <div className="timeline-sig">{item.significance}</div>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Evidence Board */}
                    {activeSection === 'evidence_board' && sections.evidence_board && (() => {
                      const eb = sections.evidence_board;
                      const categories = [
                        { key: 'confirmed_facts', label: 'Confirmed Facts', badgeClass: 'badge-confirmed' },
                        { key: 'statistics', label: 'Statistics', badgeClass: 'badge-plausible' },
                        { key: 'expert_quotes', label: 'Expert Quotes', badgeClass: 'badge-plausible' },
                        { key: 'contradictions', label: 'Contradictions', badgeClass: 'badge-contradicted' },
                        { key: 'unknowns', label: 'Unknowns', badgeClass: 'badge-unknown' },
                        { key: 'needs_verification', label: 'Needs Verification', badgeClass: 'badge-needs-source' },
                      ];
                      return (
                        <div>
                          <div className="section-header"><span className="section-label">Evidence Board</span></div>
                          {categories.map(cat => {
                            const items = eb[cat.key] || [];
                            if (!items.length) return null;
                            return (
                              <div key={cat.key} className="research-section">
                                <div className="section-header">
                                  <span className="section-label">{cat.label}</span>
                                  <span className={`section-badge ${cat.badgeClass}`}>{items.length}</span>
                                </div>
                                <div className="evidence-grid">
                                  {items.map((item: any, i: number) => (
                                    <div key={i} className="evidence-card">
                                      <div className="evidence-claim">{item.claim}</div>
                                      <div className="evidence-meta">
                                        <div className={`reliability-dot ${reliabilityClass(item.reliability)}`} title={item.reliability} />
                                        <span className="evidence-source">{item.source}</span>
                                        {item.date && <span className="evidence-source">· {item.date}</span>}
                                      </div>
                                      {item.notes && <div className="evidence-notes">{item.notes}</div>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}

                    {/* Fact Check */}
                    {activeSection === 'fact_check' && sections.fact_check && (
                      <div>
                        <div className="section-header"><span className="section-label">Fact Check</span></div>
                        <div className="fact-check-list">
                          {sections.fact_check.map((item: any, i: number) => (
                            <div key={i} className={`fact-check-item ${item.verdict?.replace(/\s+/g, '_')}`}>
                              <div style={{ flex: 1 }}>
                                <div className="fact-check-claim">{item.claim}</div>
                                <div className="fact-check-explanation">{item.explanation}</div>
                              </div>
                              <span className={`section-badge ${verdictBadgeClass(item.verdict)}`}>{item.verdict}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Multi-View */}
                    {activeSection === 'multi_view' && sections.multi_view && (() => {
                      const mv = sections.multi_view;
                      return (
                        <div>
                          <div className="section-header"><span className="section-label">Multi-View Analysis</span></div>
                          <div className="view-grid">
                            {[mv.view_a, mv.view_b, mv.view_c].filter(Boolean).map((v: any, i: number) => (
                              <div key={i} className="view-card">
                                <div className="view-label">{v.label || `View ${String.fromCharCode(65 + i)}`}</div>
                                <div className="view-arg">{v.argument}</div>
                                {v.evidence && <div className="view-evidence">{v.evidence}</div>}
                              </div>
                            ))}
                          </div>
                          <div className="special-views" style={{ marginTop: 10 }}>
                            {mv.counterargument && (
                              <div className="special-card">
                                <div className="special-label">Counterargument</div>
                                <div style={{ fontSize: 13, color: 'var(--press)' }}>{mv.counterargument}</div>
                              </div>
                            )}
                            {mv.devils_advocate && (
                              <div className="special-card">
                                <div className="special-label">Devil's Advocate</div>
                                <div style={{ fontSize: 13, color: 'var(--press)' }}>{mv.devils_advocate}</div>
                              </div>
                            )}
                            {mv.unpopular_angle && (
                              <div className="special-card">
                                <div className="special-label">Unpopular Angle</div>
                                <div style={{ fontSize: 13, color: 'var(--press)' }}>{mv.unpopular_angle}</div>
                              </div>
                            )}
                            {mv.blind_spot && (
                              <div className="special-card blind-spot">
                                <div className="special-label">◉ Blind Spot</div>
                                <div style={{ fontSize: 13, color: 'var(--press)' }}>{mv.blind_spot}</div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Thesis Options */}
                    {activeSection === 'thesis_options' && sections.thesis_options && (
                      <div>
                        <div className="section-header"><span className="section-label">Thesis Options</span></div>
                        <div className="thesis-grid">
                          {sections.thesis_options.map((t: any, i: number) => (
                            <div
                              key={i}
                              className={`thesis-card${selectedThesis === i ? ' selected' : ''}`}
                              onClick={() => setSelectedThesis(i)}
                            >
                              <div className="thesis-number">Thesis {i + 1} {selectedThesis === i ? '✓' : ''}</div>
                              <div className="thesis-arg">{t.core_argument}</div>
                              <div className="thesis-meta">
                                <div>
                                  <div className="thesis-meta-label">Evidence</div>
                                  <div className="thesis-meta-items">
                                    {(t.supporting_evidence || []).map((e: string, j: number) => (
                                      <div key={j} className="thesis-meta-item">· {e}</div>
                                    ))}
                                  </div>
                                </div>
                                <div>
                                  <div className="thesis-meta-label">Weaknesses</div>
                                  <div className="thesis-meta-items">
                                    {(t.weaknesses || []).map((w: string, j: number) => (
                                      <div key={j} className="thesis-meta-item">· {w}</div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                        <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 10 }}>Click a thesis to select it, then click Write Article in the left panel.</p>
                      </div>
                    )}

                    {/* Source Leads */}
                    {activeSection === 'source_leads' && sections.source_leads && (
                      <div>
                        <div className="section-header"><span className="section-label">Source Leads</span></div>
                        <div className="leads-grid">
                          {sections.source_leads.map((lead: any, i: number) => (
                            <div key={i} className="lead-card">
                              <div className="lead-type">{lead.type}</div>
                              <div className="lead-name">{lead.name}</div>
                              <div className="lead-why">{lead.why}</div>
                            </div>
                          ))}
                        </div>
                        {sections.related_angles && (
                          <div style={{ marginTop: 16 }}>
                            <div className="section-label" style={{ marginBottom: 8 }}>Related Angles</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                              {sections.related_angles.map((a: any, i: number) => (
                                <div key={i} style={{ background: 'var(--ink3)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--press)', marginBottom: 4 }}>{a.angle}</div>
                                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.why_interesting} · <em>{a.research_leads}</em></div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Article */}
                    {activeSection === 'article' && article && (
                      <div>
                        <div className="section-header">
                          <span className="section-label">Article — {articleMode}</span>
                          <button className="btn-copy" onClick={() => copyText(`${article.title}\n\n${article.subtitle}\n\n${article.body}`)}>Copy</button>
                        </div>
                        <div className="article-title">{article.title}</div>
                        {article.subtitle && <div className="article-subtitle">{article.subtitle}</div>}
                        <div className="article-body">{article.body}</div>
                        {article.editors_note && (
                          <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(224,82,82,.08)', border: '1px solid rgba(224,82,82,.2)', borderRadius: 'var(--radius)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 4 }}>Editor's Note</div>
                            <div style={{ fontSize: 13, color: '#e8a0a0' }}>{article.editors_note}</div>
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </>
              )}

              {/* Writing indicator */}
              {writingArticle && (
                <div className="stream-status" style={{ marginTop: 12 }}>
                  <div className="pulse" />
                  <span className="stream-status-text">Writing article from thesis {selectedThesis !== null ? selectedThesis + 1 : ''}...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ TRENDING RADAR TAB ════════════════════════════════════════════ */}
        {tab === 'radar' && (
          <div>
            <div className="panel" style={{ marginBottom: 16 }}>
              <div className="panel-title">Trending Radar</div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }}>
                  <label>Desk</label>
                  <select value={trendDesk} onChange={(e: any) => setTrendDesk(e.target.value)}>
                    {['Sports', 'Politics & Society', 'Wellness', 'Travel', 'Sinology'].map(d => <option key={d}>{d}</option>)}
                  </select>
                </div>
                <button className="btn-gold" onClick={fetchTrends} disabled={loadingTrends} style={{ marginBottom: 1 }}>
                  {loadingTrends ? 'Scanning...' : '◉ Scan Trends'}
                </button>
              </div>
            </div>

            {loadingTrends && (
              <div className="stream-status">
                <div className="pulse" />
                <span className="stream-status-text">Scanning {trendDesk} desk for investigative angles...</span>
              </div>
            )}

            {trends.length > 0 && (
              <div className="trend-grid">
                {trends.map((t: any, i: number) => (
                  <div key={i} className="trend-card" onClick={() => loadTrendTopic(t)}>
                    <div className="trend-title">{t.title}</div>
                    <div className="trend-why">{t.why_it_matters}</div>
                    <div className="trend-angle">→ {t.possible_angle}</div>
                    <div className="trend-badges">
                      <span className={`trend-badge urgency-${t.urgency}`}>{t.urgency} urgency</span>
                      <span className="trend-badge">{t.complexity}</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>Click to research →</div>
                  </div>
                ))}
              </div>
            )}

            {!loadingTrends && trends.length === 0 && (
              <div className="panel">
                <div className="empty-state">
                  <span className="empty-icon">◉</span>
                  <p>Select a desk and scan for investigative story leads.</p>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </>
  );
}
