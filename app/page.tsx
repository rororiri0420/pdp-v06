'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import {
  BUILTIN_DESKS,
  WRITING_MODES,
  TONES,
  WORKFLOW_STAGES,
  AUTHOR_VOICE_MODES,
  LIBRARY_FOLDERS,
  FORBIDDEN_TERMS,
  DEFAULT_DNA_FORM,
} from '@/lib/constants';
import type {
  Desk,
  GenerationResult,
  Post,
  PromoCode,
  AuthorVoiceMode,
  WorkflowStatus,
} from '@/types';

// ── Types local to this component ────────────────────────────────────────────
// Explicit event types — avoids implicit 'any' from JSX event handlers
type InputEvent = { target: HTMLInputElement };
type SelectEvent = { target: HTMLSelectElement };
type TextAreaEvent = { target: HTMLTextAreaElement };
type KeyEvent = { key: string };
type Tab = 'studio' | 'library' | 'dna' | 'owner';
type MessageType = 'info' | 'error' | 'success';

interface DNAForm {
  phrases: string;
  rhythm: string;
  paragraphLength: 'short' | 'medium' | 'long' | 'mixed';
  vocabulary: string;
  emotionalStyle: string;
  narrativeStyle: string;
  languageMix: string;
  avoidances: string;
}

interface LibraryFilter {
  status: string;
  desk: string;
  folder: string;
  search: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function isBlocked(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_TERMS.some((w) => lower.includes(w));
}

function getFingerprint(): string {
  let fp = localStorage.getItem('pdp_fingerprint');
  if (!fp) {
    fp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('pdp_fingerprint', fp);
  }
  return fp;
}

async function readJsonResponse(res: Response): Promise<any> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    const preview = text.replace(/\s+/g, ' ').slice(0, 500);
    throw new Error(
      `Server returned non-JSON response (${res.status}). ${preview || 'Empty response.'}`
    );
  }
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Home() {
  // ── Auth ──────────────────────────────────────────────────────────────────
  const [email, setEmail] = useState('');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [session, setSession] = useState<any>(null);

  // ── API / billing ─────────────────────────────────────────────────────────
  const [claudeKey, setClaudeKey] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [billingMode, setBillingMode] = useState<'own' | 'promo'>('own');

  // ── Studio state ──────────────────────────────────────────────────────────
  const [customDesks, setCustomDesks] = useState<Desk[]>([]);
  const [deskId, setDeskId] = useState(BUILTIN_DESKS[0].id);
  const [writingMode, setWritingMode] = useState<string>(WRITING_MODES[0]);
  const [tone, setTone] = useState<string>(TONES[0]);
  const [voiceMode, setVoiceMode] = useState<AuthorVoiceMode>('polished');
  const [audience, setAudience] = useState('Vietnamese + international Facebook audience');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [postStatus, setPostStatus] = useState<WorkflowStatus>('draft');
  const [newDeskName, setNewDeskName] = useState('');
  const [newDeskDesc, setNewDeskDesc] = useState('');

  // ── Writing DNA ───────────────────────────────────────────────────────────
  const [dnaForm, setDnaForm] = useState<DNAForm>(DEFAULT_DNA_FORM);

  // ── Library ───────────────────────────────────────────────────────────────
  const [posts, setPosts] = useState<Post[]>([]);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [libraryFilter, setLibraryFilter] = useState<LibraryFilter>({
    status: '',
    desk: '',
    folder: '',
    search: '',
  });

  // ── Owner panel ───────────────────────────────────────────────────────────
  const [ownerSecret, setOwnerSecret] = useState('');
  const [promoPlan, setPromoPlan] = useState('Starter Promo');
  const [promoLimit, setPromoLimit] = useState(20);
  const [promoUsers, setPromoUsers] = useState(1);
  const [promoExpires, setPromoExpires] = useState('');
  const [createdPromo, setCreatedPromo] = useState<PromoCode | null>(null);
  const [promoList, setPromoList] = useState<PromoCode[]>([]);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('studio');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<MessageType>('info');

  // ── Derived ───────────────────────────────────────────────────────────────
  const allDesks = useMemo(() => [...BUILTIN_DESKS, ...customDesks], [customDesks]);
  const activeDesk = useMemo(
    () => allDesks.find((d) => d.id === deskId) ?? BUILTIN_DESKS[0],
    [allDesks, deskId]
  );

  const filteredPosts = useMemo(() => {
    return posts.filter((p) => {
      if (libraryFilter.status && p.status !== libraryFilter.status) return false;
      if (libraryFilter.desk && p.desk !== libraryFilter.desk) return false;
      if (libraryFilter.folder && p.folder !== libraryFilter.folder) return false;
      if (libraryFilter.search) {
        const q = libraryFilter.search.toLowerCase();
        if (!p.title.toLowerCase().includes(q) && !(p.source_notes ?? '').toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [posts, libraryFilter]);

  // ── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    setClaudeKey(localStorage.getItem('pdp_claude_key') ?? '');
    setPromoCode(localStorage.getItem('pdp_promo_code') ?? '');

    try {
      const savedDNA = localStorage.getItem('pdp_dna');
      if (savedDNA) setDnaForm(JSON.parse(savedDNA));
    } catch {}

    try {
      const savedDesks = localStorage.getItem('pdp_custom_desks');
      if (savedDesks) setCustomDesks(JSON.parse(savedDesks));
    } catch {}

    if (!isSupabaseConfigured) return;

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setSession(data.session);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) loadPosts();
  }, [session]);

  // ── Notifications ──────────────────────────────────────────────────────────
  function notify(msg: string, type: MessageType = 'info') {
    setMessage(msg);
    setMessageType(type);
    if (type !== 'error') {
      setTimeout(() => setMessage(''), 5000);
    }
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  async function sendMagicLink() {
    if (!isSupabaseConfigured) {
      return notify('Supabase not configured. Add env vars first.', 'error');
    }
    const { error } = await supabase.auth.signInWithOtp({ email });
    notify(error ? error.message : 'Check your email for the login link.', error ? 'error' : 'success');
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    setPosts([]);
    setSelectedPost(null);
  }

  // ── API key management ────────────────────────────────────────────────────
  function saveClaudeKey() {
    localStorage.setItem('pdp_claude_key', claudeKey.trim());
    notify('Anthropic API key saved on this browser only.', 'success');
  }

  function clearClaudeKey() {
    localStorage.removeItem('pdp_claude_key');
    setClaudeKey('');
    notify('API key removed.', 'info');
  }

  function savePromo() {
    localStorage.setItem('pdp_promo_code', promoCode.trim().toUpperCase());
    notify('Promo code saved. Generations use owner credits until quota or expiry.', 'success');
  }

  // ── Writing DNA ───────────────────────────────────────────────────────────
  function saveDNA() {
    localStorage.setItem('pdp_dna', JSON.stringify(dnaForm));
    // Also sync to server if logged in
    if (session?.user) {
      // Sync to server with JWT auth — get the access token from the current session
      supabase.auth.getSession().then(({ data: sessionData }) => {
        const token = sessionData.session?.access_token;
        if (!token) return;
        fetch('/api/writing-dna', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            dna: {
              phrases: dnaForm.phrases.split(',').map((s) => s.trim()).filter(Boolean),
              rhythm: dnaForm.rhythm,
              paragraphLength: dnaForm.paragraphLength,
              vocabulary: dnaForm.vocabulary.split(',').map((s) => s.trim()).filter(Boolean),
              emotionalStyle: dnaForm.emotionalStyle,
              narrativeStyle: dnaForm.narrativeStyle,
              languageMix: dnaForm.languageMix,
              avoidances: dnaForm.avoidances.split(',').map((s) => s.trim()).filter(Boolean),
            },
          }),
        }).catch(console.error);
      });
    }
    notify('Writing DNA saved. Your voice profile will be used in all generations.', 'success');
  }

  // Two typed updaters to satisfy strict TS (paragraphLength is a union, not plain string)
  function updateDNAString(key: Exclude<keyof DNAForm, 'paragraphLength'>, value: string) {
    setDnaForm((prev) => ({ ...prev, [key]: value }));
  }
  function updateDNAParagraphLength(value: DNAForm['paragraphLength']) {
    setDnaForm((prev) => ({ ...prev, paragraphLength: value }));
  }

  // ── Custom desks ──────────────────────────────────────────────────────────
  function addCustomDesk() {
    if (!newDeskName.trim()) return notify('Enter a desk name.', 'error');
    const id = newDeskName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
    if (allDesks.find((d) => d.id === id)) return notify('A desk with that name already exists.', 'error');
    const updated: Desk[] = [
      ...customDesks,
      { id, name: newDeskName.trim(), icon: '◆', desc: newDeskDesc.trim(), isBuiltin: false },
    ];
    setCustomDesks(updated);
    localStorage.setItem('pdp_custom_desks', JSON.stringify(updated));
    setNewDeskName('');
    setNewDeskDesc('');
    notify(`Desk "${newDeskName.trim()}" created.`, 'success');
  }

  function removeCustomDesk(id: string) {
    const updated = customDesks.filter((d) => d.id !== id);
    setCustomDesks(updated);
    localStorage.setItem('pdp_custom_desks', JSON.stringify(updated));
    if (deskId === id) setDeskId(BUILTIN_DESKS[0].id);
  }

  // ── Library ───────────────────────────────────────────────────────────────
  const loadPosts = useCallback(async () => {
    const { data, error } = await supabase
      .from('posts')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(150);
    if (!error) setPosts((data as unknown as Post[]) ?? []);
  }, []); // supabase client is stable

  async function toggleFavorite(post: Post) {
    await supabase.from('posts').update({ is_favorite: !post.is_favorite }).eq('id', post.id);
    loadPosts();
    if (selectedPost?.id === post.id) {
      setSelectedPost({ ...selectedPost, is_favorite: !post.is_favorite });
    }
  }

  async function updatePostStatus(id: string, newStatus: WorkflowStatus) {
    await supabase.from('posts').update({ status: newStatus }).eq('id', id);
    loadPosts();
    if (selectedPost?.id === id) {
      setSelectedPost((p) => p ? { ...p, status: newStatus } : null);
    }
  }

  async function deletePost(id: string) {
    if (!confirm('Delete this draft permanently?')) return;
    await supabase.from('posts').delete().eq('id', id);
    if (selectedPost?.id === id) setSelectedPost(null);
    loadPosts();
    notify('Draft deleted.', 'info');
  }

  async function savePost() {
    if (!result) return;
    if (!session?.user) return notify('Log in to save to your library.', 'error');

    const { error } = await supabase.from('posts').insert({
      user_id: session.user.id,
      title: result.title || 'Untitled',
      desk: activeDesk.name,
      status: postStatus,
      writing_mode: voiceMode,
      source_notes: notes,
      vietnamese: result.vietnamese ?? '',
      english: result.english ?? '',
      captions: JSON.stringify(result.captions ?? []),
      social_pack: result.social_pack ?? {},
      score: result.editorial_score ?? {},
      ai_voice_warnings: result.ai_voice_warnings ?? [],
      fact_check_notes: result.fact_check_notes ?? [],
      publish_notes: result.publish_notes ?? '',
      folder: 'Inbox',
      tags: [],
      is_favorite: false,
    });

    if (error) notify(error.message, 'error');
    else {
      notify('Saved to your private library.', 'success');
      loadPosts();
    }
  }

  // ── Generate ──────────────────────────────────────────────────────────────
  async function generate() {
    setMessage('');
    setResult(null);

    if (isBlocked(`${deskId} ${notes}`)) {
      return notify('Topic blocked by your public-content rules.', 'error');
    }
    if (billingMode === 'own' && !claudeKey.trim()) {
      return notify('Add your Anthropic API key or switch to a promo code.', 'error');
    }
    if (billingMode === 'promo' && !promoCode.trim()) {
      return notify('Enter an owner promo code first.', 'error');
    }
    if (!notes.trim()) {
      return notify('Add your raw notes or pitch before generating.', 'error');
    }

    setLoading(true);
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          desk: activeDesk.name,
          mode: writingMode,
          tone,
          audience,
          notes,
          writingMode: voiceMode,
          writingDNA: {
            phrases: dnaForm.phrases.split(',').map((s) => s.trim()).filter(Boolean),
            rhythm: dnaForm.rhythm,
            paragraphLength: dnaForm.paragraphLength,
            vocabulary: dnaForm.vocabulary.split(',').map((s) => s.trim()).filter(Boolean),
            emotionalStyle: dnaForm.emotionalStyle,
            narrativeStyle: dnaForm.narrativeStyle,
            languageMix: dnaForm.languageMix,
            avoidances: dnaForm.avoidances.split(',').map((s) => s.trim()).filter(Boolean),
          },
          userClaudeKey: billingMode === 'own' ? claudeKey.trim() : '',
          promoCode: billingMode === 'promo' ? promoCode.trim().toUpperCase() : '',
          userId: session?.user?.id,
          userFingerprint: getFingerprint(),
        }),
      });

      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Generation failed');

      setResult(data as GenerationResult);

      const engine = data.billing?.engine ?? 'Claude';
      const promoNote =
        data.billing?.mode === 'owner_promo'
          ? ` · Promo remaining: ${data.billing?.promo_remaining_generations}`
          : '';
      notify(`Draft generated. Engine: ${engine}${promoNote}`, 'success');
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Generation failed.', 'error');
    } finally {
      setLoading(false);
    }
  }

  function copyText(text: string, label = '') {
    navigator.clipboard.writeText(text ?? '');
    notify(`${label ? label + ' ' : ''}Copied.`, 'info');
  }

  // ── Owner panel ───────────────────────────────────────────────────────────
  async function createPromo() {
    setCreatedPromo(null);
    try {
      const res = await fetch('/api/promo/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-owner-secret': ownerSecret },
        body: JSON.stringify({
          plan_name: promoPlan,
          max_generations: promoLimit,
          max_users: promoUsers,
          expires_at: promoExpires ? new Date(promoExpires).toISOString() : null,
        }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Failed to create promo');
      setCreatedPromo(data.promo as PromoCode);
      notify(`Promo created: ${data.promo.code}`, 'success');
      loadPromos();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Failed to create promo', 'error');
    }
  }

  async function loadPromos() {
    try {
      const res = await fetch('/api/promo/list', {
        headers: { 'x-owner-secret': ownerSecret },
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Failed to load promos');
      setPromoList(data.promos as PromoCode[]);
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Failed to load promos', 'error');
    }
  }

  async function togglePromo(code: string, isActive: boolean) {
    try {
      const res = await fetch('/api/promo/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-owner-secret': ownerSecret },
        body: JSON.stringify({ code, is_active: !isActive }),
      });
      const data = await readJsonResponse(res);
      if (!res.ok) throw new Error(data.error || 'Failed to update promo');
      notify(`${code} ${!isActive ? 'activated' : 'paused'}.`, 'success');
      loadPromos();
    } catch (err: unknown) {
      notify(err instanceof Error ? err.message : 'Failed to update promo', 'error');
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════════════════════════
  return (
    <main>
      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <header className="pdp-header">
        <div className="pdp-header-left">
          <div className="pdp-logo">
            <span className="pdp-logo-mark">P</span>
            <div>
              <span className="pdp-logo-name">Phong Daily Press</span>
              <span className="pdp-logo-version">v0.6 · Human-First AI Newsroom</span>
            </div>
          </div>
          <nav className="pdp-nav">
            {(
              [
                { id: 'studio', label: '◈ Studio' },
                { id: 'library', label: '◎ Library' },
                { id: 'dna', label: '◆ Writing DNA' },
                { id: 'owner', label: '⚙ Owner' },
              ] as { id: Tab; label: string }[]
            ).map(({ id, label }) => (
              <button
                key={id}
                className={`nav-btn${tab === id ? ' active' : ''}`}
                onClick={() => setTab(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="pdp-header-right">
          {session?.user ? (
            <div className="auth-info">
              <span className="auth-email">{session.user.email}</span>
              <button className="btn-ghost" onClick={signOut}>
                Sign out
              </button>
            </div>
          ) : (
            <div className="auth-row">
              <input
                className="auth-input"
                placeholder="your@email.com"
                type="email"
                value={email}
                onChange={(e: InputEvent) => setEmail(e.target.value)}
                onKeyDown={(e: KeyEvent) => e.key === 'Enter' && sendMagicLink()}
              />
              <button className="btn-ghost" onClick={sendMagicLink}>
                Magic link
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── NOTIFICATION BANNER ─────────────────────────────────────────── */}
      {message && (
        <div className={`banner banner-${messageType}`} onClick={() => setMessage('')}>
          {message}
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          STUDIO TAB
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'studio' && (
        <div className="studio-layout">
          {/* ── Left controls ─────────────────────────────────────────── */}
          <div className="studio-left">
            {/* Billing */}
            <section className="panel">
              <h2 className="panel-title">API Access</h2>
              <div className="billing-toggle">
                <button
                  className={`toggle-btn${billingMode === 'own' ? ' active' : ''}`}
                  onClick={() => setBillingMode('own')}
                >
                  My Anthropic key
                </button>
                <button
                  className={`toggle-btn${billingMode === 'promo' ? ' active' : ''}`}
                  onClick={() => setBillingMode('promo')}
                >
                  Promo code
                </button>
              </div>

              {billingMode === 'own' ? (
                <>
                  <label>Anthropic API Key</label>
                  <input
                    type="password"
                    placeholder="sk-ant-..."
                    value={claudeKey}
                    onChange={(e: InputEvent) => setClaudeKey(e.target.value)}
                  />
                  <div className="btn-row">
                    <button onClick={saveClaudeKey}>Save on this browser</button>
                    <button onClick={clearClaudeKey}>Remove</button>
                  </div>
                  <p className="hint">Key stored in localStorage — stays on your device only.</p>
                </>
              ) : (
                <>
                  <label>Promo Code</label>
                  <input
                    placeholder="PDP-ABC123"
                    value={promoCode}
                    onChange={(e: InputEvent) => setPromoCode(e.target.value.toUpperCase())}
                  />
                  <div className="btn-row">
                    <button onClick={savePromo}>Save promo</button>
                  </div>
                </>
              )}
            </section>

            {/* Author Voice Mode */}
            <section className="panel">
              <h2 className="panel-title">Author Voice Mode</h2>
              <div className="voice-mode-grid">
                {AUTHOR_VOICE_MODES.map((vm) => (
                  <button
                    key={vm.id}
                    className={`voice-btn${voiceMode === vm.id ? ' active' : ''}`}
                    onClick={() => setVoiceMode(vm.id)}
                  >
                    <span className="voice-label">{vm.label}</span>
                    <span className="voice-desc">{vm.desc}</span>
                  </button>
                ))}
              </div>
              <p className="hint anti-ai-note">
                ◉ Anti-AI filter active — clichés, corporate language, and motivational filler are
                automatically flagged and removed.
              </p>
            </section>

            {/* Desk selector */}
            <section className="panel">
              <h2 className="panel-title">Desk</h2>
              <div className="desk-grid">
                {allDesks.map((d) => (
                  <button
                    key={d.id}
                    className={`desk-btn${deskId === d.id ? ' active' : ''}`}
                    onClick={() => setDeskId(d.id)}
                  >
                    <span className="desk-icon">{d.icon}</span>
                    <span className="desk-name">{d.name}</span>
                    <span className="desk-desc">{d.desc}</span>
                    {!d.isBuiltin && (
                      <span
                        className="desk-remove"
                        onClick={(e: { stopPropagation(): void }) => {
                          e.stopPropagation();
                          removeCustomDesk(d.id);
                        }}
                        title="Remove desk"
                      >
                        ×
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div className="custom-desk">
                <label>Add custom desk</label>
                <div className="custom-desk-row">
                  <input
                    placeholder="Desk name"
                    value={newDeskName}
                    onChange={(e: InputEvent) => setNewDeskName(e.target.value)}
                    onKeyDown={(e: KeyEvent) => e.key === 'Enter' && addCustomDesk()}
                  />
                  <input
                    placeholder="Short description"
                    value={newDeskDesc}
                    onChange={(e: InputEvent) => setNewDeskDesc(e.target.value)}
                  />
                  <button onClick={addCustomDesk}>+ Add</button>
                </div>
              </div>
            </section>

            {/* Production settings */}
            <section className="panel">
              <h2 className="panel-title">Production Settings</h2>
              <div className="two-col">
                <div>
                  <label>Writing Mode</label>
                  <select value={writingMode} onChange={(e: SelectEvent) => setWritingMode(e.target.value)}>
                    {WRITING_MODES.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Tone</label>
                  <select value={tone} onChange={(e: SelectEvent) => setTone(e.target.value)}>
                    {TONES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <label>Audience</label>
              <input value={audience} onChange={(e: InputEvent) => setAudience(e.target.value)} />
              <label>Pitch / Raw Notes / Reporter Material</label>
              <textarea
                value={notes}
                onChange={(e: InputEvent) => setNotes(e.target.value)}
                placeholder={`Paste your story idea, raw notes, travel memory, interview fragments, Sinology entry, or anything for the ${activeDesk.name}...`}
              />
              <button className="btn-primary" onClick={generate} disabled={loading}>
                {loading ? 'Writing...' : `Generate · ${activeDesk.name}`}
              </button>
            </section>
          </div>

          {/* ── Right: Output ──────────────────────────────────────────── */}
          <div className="studio-right">
            <section className="panel output-panel">
              <div className="output-header">
                <h2 className="panel-title">Output</h2>
                {result && (
                  <div className="output-actions">
                    <select
                      value={postStatus}
                      onChange={(e: SelectEvent) => setPostStatus(e.target.value as WorkflowStatus)}
                    >
                      {WORKFLOW_STAGES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <button className="btn-save" onClick={savePost}>
                      Save to Library
                    </button>
                  </div>
                )}
              </div>

              {!result ? (
                <div className="output-empty">
                  <span className="output-empty-icon">◈</span>
                  <p>Generated package appears here.</p>
                  <p className="hint">
                    Powered by Claude Sonnet 4.6 · Reads your Writing DNA profile.
                  </p>
                </div>
              ) : (
                <div className="output-body">
                  <div className="output-title">{result.title}</div>

                  {/* Headlines */}
                  <div className="output-section">
                    <div className="section-label">Headlines — click to copy</div>
                    <ol className="headline-list">
                      {(result.headlines ?? []).map((h, i) => (
                        <li key={i} className="headline-item" onClick={() => copyText(h, 'Headline')}>
                          {h}
                        </li>
                      ))}
                    </ol>
                  </div>

                  {/* Anti-AI filter log */}
                  {(result.ai_voice_warnings ?? []).length > 0 && (
                    <div className="output-section filter-log">
                      <div className="section-label">◉ Anti-AI Filter Log</div>
                      <ul>
                        {result.ai_voice_warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Vietnamese */}
                  <div className="output-section">
                    <div className="section-label-row">
                      <span className="section-label">Vietnamese Edition</span>
                      <button className="btn-copy" onClick={() => copyText(result.vietnamese, 'VN')}>
                        Copy
                      </button>
                    </div>
                    <div className="article-body">{result.vietnamese}</div>
                  </div>

                  {/* English */}
                  <div className="output-section">
                    <div className="section-label-row">
                      <span className="section-label">English Edition</span>
                      <button className="btn-copy" onClick={() => copyText(result.english, 'EN')}>
                        Copy
                      </button>
                    </div>
                    <div className="article-body">{result.english}</div>
                  </div>

                  {/* Social pack */}
                  {result.social_pack && (
                    <div className="output-section">
                      <div className="section-label">Social Pack</div>
                      <div className="social-grid">
                        {Object.entries(result.social_pack).map(([k, v]) => (
                          <div key={k} className="social-card">
                            <div className="social-key">{k.replace(/_/g, ' ')}</div>
                            <div className="social-value">{v}</div>
                            <button className="btn-copy-sm" onClick={() => copyText(v)}>
                              Copy
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Opening hooks */}
                  {(result.hooks ?? []).length > 0 && (
                    <div className="output-section">
                      <div className="section-label">Opening Hooks — click to copy</div>
                      {result.hooks.map((h, i) => (
                        <div key={i} className="hook-item" onClick={() => copyText(h, 'Hook')}>
                          {h}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Hashtags */}
                  {(result.hashtags ?? []).length > 0 && (
                    <div className="output-section">
                      <div className="section-label">Hashtags</div>
                      <div className="hashtag-row">
                        {result.hashtags.map((h, i) => (
                          <span key={i} className="hashtag" onClick={() => copyText(h)}>
                            {h}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Editorial score */}
                  {result.editorial_score && (
                    <div className="output-section">
                      <div className="section-label">Editorial Score</div>
                      <div className="score-grid">
                        {Object.entries(result.editorial_score).map(([k, v]) => (
                          <div key={k} className="score-card">
                            <div className="score-key">{k.replace(/_/g, ' ')}</div>
                            <div className="score-val">{v}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Fact check */}
                  {(result.fact_check_notes ?? []).length > 0 && (
                    <div className="output-section fact-check">
                      <div className="section-label">Fact Check Notes</div>
                      <ul>
                        {result.fact_check_notes.map((n, i) => (
                          <li key={i}>{n}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Publish notes */}
                  {result.publish_notes && (
                    <div className="output-section">
                      <div className="section-label">Publish Notes</div>
                      <p className="publish-notes">{result.publish_notes}</p>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          LIBRARY TAB
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'library' && (
        <div className="library-layout">
          <div className="library-sidebar panel">
            <h2 className="panel-title">Library</h2>
            {!session?.user && (
              <p className="hint">Log in to access your private article library.</p>
            )}

            <label>Search</label>
            <input
              placeholder="Title or notes..."
              value={libraryFilter.search}
              onChange={(e: SelectEvent) => setLibraryFilter((p) => ({ ...p, search: e.target.value }))}
            />

            <label>Status</label>
            <select
              value={libraryFilter.status}
              onChange={(e: SelectEvent) => setLibraryFilter((p) => ({ ...p, status: e.target.value }))}
            >
              <option value="">All statuses</option>
              {WORKFLOW_STAGES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>

            <label>Desk</label>
            <select
              value={libraryFilter.desk}
              onChange={(e: SelectEvent) => setLibraryFilter((p) => ({ ...p, desk: e.target.value }))}
            >
              <option value="">All desks</option>
              {allDesks.map((d) => (
                <option key={d.id} value={d.name}>
                  {d.name}
                </option>
              ))}
            </select>

            <label>Folder</label>
            <select
              value={libraryFilter.folder}
              onChange={(e: SelectEvent) => setLibraryFilter((p) => ({ ...p, folder: e.target.value }))}
            >
              <option value="">All folders</option>
              {LIBRARY_FOLDERS.map((f) => (
                <option key={f}>{f}</option>
              ))}
            </select>

            <div className="library-count">{filteredPosts.length} articles</div>
          </div>

          <div className="library-main">
            {filteredPosts.length === 0 ? (
              <div className="empty-state">
                <span className="empty-icon">◎</span>
                <p>
                  {posts.length === 0
                    ? 'No saved articles yet. Generate something in the Studio.'
                    : 'No articles match your filters.'}
                </p>
              </div>
            ) : (
              <div className="post-grid">
                {filteredPosts.map((p) => (
                  <div
                    key={p.id}
                    className={`post-card${selectedPost?.id === p.id ? ' selected' : ''}`}
                    onClick={() => setSelectedPost(selectedPost?.id === p.id ? null : p)}
                  >
                    <div className="post-card-top">
                      <span className={`status-badge status-${p.status}`}>{p.status}</span>
                      <button
                        className={`fav-btn${p.is_favorite ? ' active' : ''}`}
                        onClick={(e: { stopPropagation(): void }) => {
                          e.stopPropagation();
                          toggleFavorite(p);
                        }}
                        title="Toggle favorite"
                      >
                        ★
                      </button>
                    </div>
                    <h3 className="post-card-title">{p.title}</h3>
                    <div className="post-card-meta">
                      {p.desk} · {p.writing_mode}
                    </div>
                    <div className="post-card-date">
                      {new Date(p.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedPost && (
              <div className="post-detail">
                <div className="post-detail-header">
                  <div>
                    <h2>{selectedPost.title}</h2>
                    <div className="post-detail-meta">
                      {selectedPost.desk} · {selectedPost.status} ·{' '}
                      {new Date(selectedPost.updated_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="post-detail-actions">
                    <select
                      value={selectedPost.status}
                      onChange={(e: SelectEvent) =>
                        updatePostStatus(selectedPost.id, e.target.value as WorkflowStatus)
                      }
                    >
                      {WORKFLOW_STAGES.map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                    <button onClick={() => copyText(selectedPost.vietnamese, 'Vietnamese')}>
                      Copy VN
                    </button>
                    <button onClick={() => copyText(selectedPost.english, 'English')}>
                      Copy EN
                    </button>
                    <button
                      className="btn-danger"
                      onClick={() => deletePost(selectedPost.id)}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <div className="post-detail-body">
                  <h4>Vietnamese</h4>
                  <div className="article-body">{selectedPost.vietnamese}</div>
                  <h4>English</h4>
                  <div className="article-body">{selectedPost.english}</div>
                  {selectedPost.publish_notes && (
                    <>
                      <h4>Publish Notes</h4>
                      <p className="publish-notes">{selectedPost.publish_notes}</p>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          WRITING DNA TAB
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'dna' && (
        <div className="dna-layout">
          <div className="panel dna-panel">
            <h2 className="panel-title">Writing DNA Profile</h2>
            <p className="hint dna-intro">
              Your Writing DNA is read by Claude before every generation. The more precise you are
              here, the more the output sounds like you — not like an AI content team. Saved locally
              and optionally synced to your account.
            </p>

            <div className="dna-grid">
              <div className="dna-field">
                <label>Signature Phrases</label>
                <input
                  value={dnaForm.phrases}
                  onChange={(e: InputEvent) => updateDNAString('phrases', e.target.value)}
                  placeholder='e.g. "hắn nhớ lại", "không phải vì", "một mình" — comma separated'
                />
              </div>
              <div className="dna-field">
                <label>Sentence Rhythm</label>
                <input
                  value={dnaForm.rhythm}
                  onChange={(e: InputEvent) => updateDNAString('rhythm', e.target.value)}
                  placeholder="e.g. Short sentences. Long breath. Then silence."
                />
              </div>
              <div className="dna-field">
                <label>Paragraph Length</label>
                <select
                  value={dnaForm.paragraphLength}
                  onChange={(e: SelectEvent) =>
                    updateDNAParagraphLength(e.target.value as DNAForm['paragraphLength'])
                  }
                >
                  <option value="short">Short — 1–3 sentences</option>
                  <option value="medium">Medium — 3–5 sentences</option>
                  <option value="long">Long — 5+ sentences, dense blocks</option>
                  <option value="mixed">Mixed — varies by section</option>
                </select>
              </div>
              <div className="dna-field">
                <label>Common Vocabulary</label>
                <input
                  value={dnaForm.vocabulary}
                  onChange={(e: InputEvent) => updateDNAString('vocabulary', e.target.value)}
                  placeholder="e.g. hắn, lữ hành, dã tràng, vô ích — comma separated"
                />
              </div>
              <div className="dna-field">
                <label>Emotional Register</label>
                <input
                  value={dnaForm.emotionalStyle}
                  onChange={(e: InputEvent) => updateDNAString('emotionalStyle', e.target.value)}
                  placeholder="e.g. Cool detachment with rare moments of intensity. Never melodramatic."
                />
              </div>
              <div className="dna-field">
                <label>Narrative Approach</label>
                <input
                  value={dnaForm.narrativeStyle}
                  onChange={(e: InputEvent) => updateDNAString('narrativeStyle', e.target.value)}
                  placeholder="e.g. Anecdotal → philosophical. Specific memory → general observation."
                />
              </div>
              <div className="dna-field">
                <label>Language Mixing</label>
                <input
                  value={dnaForm.languageMix}
                  onChange={(e: InputEvent) => updateDNAString('languageMix', e.target.value)}
                  placeholder="e.g. Vietnamese dominant with English technical terms."
                />
              </div>
              <div className="dna-field">
                <label>Phrases to Avoid</label>
                <input
                  value={dnaForm.avoidances}
                  onChange={(e: InputEvent) => updateDNAString('avoidances', e.target.value)}
                  placeholder='e.g. "hành trình", "bài học quý giá", "thành công" — comma separated'
                />
              </div>
            </div>

            <button className="btn-primary" onClick={saveDNA}>
              Save Writing DNA
            </button>

            <div className="dna-preview">
              <div className="section-label">Current DNA (raw)</div>
              <pre className="dna-raw">{JSON.stringify(dnaForm, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          OWNER TAB
      ════════════════════════════════════════════════════════════════════ */}
      {tab === 'owner' && (
        <div className="owner-layout">
          <div className="panel owner-panel">
            <h2 className="panel-title">Owner Panel</h2>
            <p className="hint">
              Promo credit management, writing engine status, user administration.
            </p>

            <label>Owner Admin Secret</label>
            <input
              type="password"
              placeholder="OWNER_ADMIN_SECRET from .env"
              value={ownerSecret}
              onChange={(e: InputEvent) => setOwnerSecret(e.target.value)}
            />

            {/* Engine status */}
            <div className="owner-section">
              <h3>Writing Engine Status</h3>
              <div className="engine-card">
                <div className="engine-row">
                  <div>
                    <div className="engine-primary">Claude Sonnet 4.6</div>
                    <div className="hint">
                      Primary writing brain — long-form, memoir, editorial, essays, Sinology,
                      bilingual generation, storytelling.
                    </div>
                  </div>
                  <span className="engine-badge">Active</span>
                </div>
                <div className="engine-row" style={{ marginTop: 12 }}>
                  <div>
                    <div className="engine-secondary">GPT (optional)</div>
                    <div className="hint">
                      Operations brain — research, fact extraction, tagging, analytics. Users bring
                      their own OpenAI key.
                    </div>
                  </div>
                  <span className="engine-badge engine-badge-optional">Optional</span>
                </div>
              </div>
            </div>

            {/* Create promo */}
            <div className="owner-section">
              <h3>Create Promo Code</h3>
              <div className="two-col">
                <div>
                  <label>Plan Name</label>
                  <input
                    value={promoPlan}
                    onChange={(e: InputEvent) => setPromoPlan(e.target.value)}
                  />
                </div>
                <div>
                  <label>Max Generations</label>
                  <input
                    type="number"
                    min={1}
                    value={promoLimit}
                    onChange={(e: InputEvent) => setPromoLimit(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label>Max Users</label>
                  <input
                    type="number"
                    min={1}
                    value={promoUsers}
                    onChange={(e: InputEvent) => setPromoUsers(Number(e.target.value))}
                  />
                </div>
                <div>
                  <label>Expires (optional)</label>
                  <input
                    type="datetime-local"
                    value={promoExpires}
                    onChange={(e: InputEvent) => setPromoExpires(e.target.value)}
                  />
                </div>
              </div>
              <div className="btn-row">
                <button onClick={createPromo}>Create promo code</button>
                <button onClick={loadPromos}>Load all promos</button>
              </div>
              {createdPromo && (
                <div className="banner banner-success" style={{ marginTop: 12 }}>
                  New code: <strong>{createdPromo.code}</strong> · {createdPromo.max_generations}{' '}
                  generations · {createdPromo.max_users} user(s)
                </div>
              )}
            </div>

            {/* Promo list */}
            {promoList.length > 0 && (
              <div className="owner-section">
                <h3>All Promo Codes ({promoList.length})</h3>
                <div className="promo-grid">
                  {promoList.map((p) => (
                    <div key={p.code} className="promo-card">
                      <div className="promo-code">{p.code}</div>
                      <div className="promo-plan">{p.plan_name}</div>
                      <div className="promo-usage">
                        {p.used_generations} / {p.max_generations} generations used
                      </div>
                      <div className="promo-expiry">
                        Expires:{' '}
                        {p.expires_at ? new Date(p.expires_at).toLocaleString() : 'No expiry'}
                      </div>
                      <button
                        className={p.is_active ? 'btn-pause' : 'btn-activate'}
                        onClick={() => togglePromo(p.code, p.is_active)}
                      >
                        {p.is_active ? 'Pause' : 'Activate'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
