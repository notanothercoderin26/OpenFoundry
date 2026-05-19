// Edit-with-AIP modal (Slice D). Anchored to the current TipTap
// selection: the parent decides when to mount; this component owns
// the chain history, action dropdowns and the Replace / Try again
// / Discard flow.
//
// Foundry parity:
//   * Free-form prompt input + arrow submit
//   * Fix spelling / grammar
//   * Change writing style (Professional / Confident)
//   * Shorten
//   * Translate (English / Spanish / French / German / Japanese /
//     Korean / Ukrainian)
//   * Functions (placeholder list — wires into ai-evaluation-service
//     later)
//   * Multiple operations stack so the user can preview "Original
//     text → French → Shorten" before replacing the selection.

import { useEffect, useMemo, useRef, useState } from 'react';

import {
  transformNotepadText,
  type AIPTransformOp,
  type AIPTransformResult,
} from '@/lib/api/notepad';

const TRANSLATE_OPTIONS = ['English', 'Spanish', 'French', 'German', 'Japanese', 'Korean', 'Ukrainian'];

const STYLE_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: 'professional', label: 'Professional', description: 'Suitable for reports' },
  { value: 'confident', label: 'Confident', description: 'Suitable for announcements' },
];

// Placeholder catalogue until ai-evaluation-service publishes the
// real list of in-platform functions accepting a string input.
const FUNCTION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'summarise.v1', label: 'Summarise (one paragraph)' },
  { value: 'bullets.v1', label: 'Convert to bullet points' },
  { value: 'tldr.v1', label: 'TL;DR' },
];

export interface AIPPopoverProps {
  sourceText: string;
  // Called when the user accepts the preview. The parent should
  // replace the editor selection with `text`.
  onReplace: (text: string) => void;
  onClose: () => void;
}

export function AIPPopover({ sourceText, onReplace, onClose }: AIPPopoverProps) {
  const [prompt, setPrompt] = useState('');
  const [history, setHistory] = useState<AIPTransformResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openMenu, setOpenMenu] = useState<'style' | 'translate' | 'functions' | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const latest = history[history.length - 1];
  // The text we feed into the next transform: the latest preview if
  // any, otherwise the original selection. This is what gives the
  // "Original text → French → Shorten" chain its preview honesty.
  const currentText = useMemo(() => latest?.result ?? sourceText, [latest, sourceText]);

  async function runOp(op: AIPTransformOp, options?: Record<string, string>, promptOverride?: string) {
    setError('');
    setLoading(true);
    setOpenMenu(null);
    try {
      const result = await transformNotepadText({
        op,
        text: currentText,
        prompt: promptOverride,
        options,
      });
      setHistory((prev) => [...prev, result]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'AIP transform failed');
    } finally {
      setLoading(false);
    }
  }

  function tryAgain() {
    if (history.length === 0) return;
    setHistory((prev) => prev.slice(0, -1));
  }

  function handlePromptSubmit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    void runOp('custom_prompt', undefined, trimmed);
    setPrompt('');
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.42)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: 80,
        zIndex: 60,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          borderRadius: 'var(--radius-md)',
          minWidth: 520,
          maxWidth: 720,
          maxHeight: '78vh',
          overflow: 'auto',
          padding: 0,
          boxShadow: '0 20px 60px rgba(15, 23, 42, 0.18)',
          display: 'grid',
          gap: 0,
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 18px',
            borderBottom: '1px solid var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 16 }}>✨</span>
            <strong>Edit with AIP</strong>
            {latest?.annotation && (
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>· {latest.annotation}</span>
            )}
          </div>
          <button
            type="button"
            className="of-btn"
            onClick={onClose}
            title="Close"
            style={{ minWidth: 24, height: 24, padding: '0 6px', fontSize: 12 }}
          >
            ✕
          </button>
        </header>

        <section style={{ padding: '14px 18px', display: 'grid', gap: 12 }}>
          <div>
            <p className="of-eyebrow" style={{ marginBottom: 4 }}>
              {history.length === 0 ? 'Selected text' : `Preview after ${history.length} step${history.length === 1 ? '' : 's'}`}
            </p>
            <div
              style={{
                padding: '10px 12px',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                background: 'var(--bg-panel-muted)',
                fontSize: 14,
                whiteSpace: 'pre-wrap',
                maxHeight: 220,
                overflow: 'auto',
              }}
            >
              {currentText}
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              ref={inputRef}
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handlePromptSubmit();
                }
              }}
              placeholder="Enter prompt…"
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
            <button
              type="button"
              className="of-btn of-btn-primary"
              onClick={handlePromptSubmit}
              disabled={!prompt.trim() || loading}
              title="Apply custom prompt"
              style={{ minWidth: 36, height: 36 }}
            >
              →
            </button>
          </div>

          <div style={{ display: 'grid', gap: 4 }}>
            <ActionRow
              icon="Aa"
              label="Fix spelling / grammar"
              onClick={() => void runOp('fix_grammar')}
              disabled={loading}
            />
            <ActionRow
              icon="✎"
              label="Change writing style"
              chevron
              active={openMenu === 'style'}
              onClick={() => setOpenMenu(openMenu === 'style' ? null : 'style')}
              disabled={loading}
            />
            {openMenu === 'style' && (
              <SubMenu>
                {STYLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className="of-btn"
                    onClick={() => void runOp('change_style', { style: opt.value })}
                    style={subItemStyle}
                  >
                    <span style={{ fontWeight: 600 }}>{opt.label}</span>
                    <span style={{ color: 'var(--text-muted)', fontSize: 12, marginLeft: 8 }}>{opt.description}</span>
                  </button>
                ))}
              </SubMenu>
            )}
            <ActionRow
              icon="↧"
              label="Shorten"
              onClick={() => void runOp('shorten')}
              disabled={loading}
            />
            <ActionRow
              icon="文"
              label="Translate"
              chevron
              active={openMenu === 'translate'}
              onClick={() => setOpenMenu(openMenu === 'translate' ? null : 'translate')}
              disabled={loading}
            />
            {openMenu === 'translate' && (
              <SubMenu>
                {TRANSLATE_OPTIONS.map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    className="of-btn"
                    onClick={() => void runOp('translate', { target_lang: lang })}
                    style={subItemStyle}
                  >
                    {lang}
                  </button>
                ))}
              </SubMenu>
            )}
            <ActionRow
              icon="ƒx"
              label="Functions"
              chevron
              active={openMenu === 'functions'}
              onClick={() => setOpenMenu(openMenu === 'functions' ? null : 'functions')}
              disabled={loading}
            />
            {openMenu === 'functions' && (
              <SubMenu>
                {FUNCTION_OPTIONS.map((fn) => (
                  <button
                    key={fn.value}
                    type="button"
                    className="of-btn"
                    onClick={() => void runOp('function', { function_id: fn.value })}
                    style={subItemStyle}
                  >
                    {fn.label}
                  </button>
                ))}
                <p style={{ fontSize: 11, color: 'var(--text-muted)', padding: '6px 10px', margin: 0 }}>
                  Function dispatch wires into ai-evaluation-service in a follow-up; previews are
                  currently stubbed.
                </p>
              </SubMenu>
            )}
          </div>

          {error && (
            <div
              className="of-status-danger"
              style={{ padding: '8px 12px', borderRadius: 6, fontSize: 13 }}
            >
              {error}
            </div>
          )}
          {latest && latest.provider === 'mock' && (
            <div
              style={{
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12,
                background: '#fef3c7',
                color: '#92400e',
              }}
            >
              This operation is currently mocked. The text returned matches the source until
              agent-runtime-service is wired in.
            </div>
          )}
        </section>

        <footer
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '12px 18px',
            borderTop: '1px solid var(--border-default)',
            gap: 8,
          }}
        >
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="of-btn"
              onClick={tryAgain}
              disabled={history.length === 0 || loading}
              title="Pop the last preview off the stack"
            >
              ↩ Try again
            </button>
            <button type="button" className="of-btn" onClick={onClose} disabled={loading}>
              Discard
            </button>
          </div>
          <button
            type="button"
            className="of-btn of-btn-primary"
            disabled={history.length === 0 || loading}
            onClick={() => onReplace(currentText)}
          >
            Replace
          </button>
        </footer>
      </div>
    </div>
  );
}

interface ActionRowProps {
  icon: string;
  label: string;
  active?: boolean;
  chevron?: boolean;
  onClick: () => void;
  disabled?: boolean;
}

function ActionRow({ icon, label, active, chevron, onClick, disabled }: ActionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '8px 10px',
        border: '1px solid transparent',
        background: active ? 'var(--bg-panel-muted)' : 'transparent',
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        textAlign: 'left',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span
          style={{
            width: 26,
            height: 26,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 4,
            background: 'var(--bg-panel-muted)',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          {icon}
        </span>
        <span style={{ fontSize: 14, color: 'var(--text-strong)' }}>{label}</span>
      </span>
      {chevron && <span style={{ color: 'var(--text-muted)' }}>›</span>}
    </button>
  );
}

function SubMenu({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginLeft: 36,
        padding: '4px 0',
        display: 'grid',
        gap: 4,
        borderLeft: '2px solid var(--border-default)',
        paddingLeft: 12,
      }}
    >
      {children}
    </div>
  );
}

const subItemStyle: React.CSSProperties = {
  justifyContent: 'flex-start',
  padding: '6px 8px',
  fontSize: 13,
  textAlign: 'left',
};
