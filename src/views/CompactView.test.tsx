/**
 * The far view must identify an agent the SAME way the near view does.
 *
 * This repo has already paid for a screen that answered differently depending
 * on the zoom, so the badge is worth pinning: an agent recognised by its logo
 * up close and by two letters from across the canvas is two answers to one
 * question.
 *
 * Mounted with react-dom directly, like the other component tests here — no
 * testing-library, so this adds no dependency.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import CompactView from './CompactView';
import type { SourceStatus } from './Hub';
import { dictFor } from '../i18n';
import type { Connector } from '@mnemosyne_os/agent-transcripts';

const t = dictFor('fr');
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  // React needs to be told this is a test environment, or every act() warns.
  (globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function status(id: string, mark: Connector['mark']): SourceStatus {
  return {
    source: {
      id,
      sessions: {
        id, displayName: id, version: '1.0.0', format: 'jsonl', kind: 'session',
        filePattern: '.jsonl', fields: { timestamp: 'ts' }, mark,
      },
    },
    folder: 'C:/somewhere',
    sessions: [],
    notes: 0,
    busy: false,
  };
}

function show(statuses: SourceStatus[], collisions = 0): void {
  act(() => {
    root.render(<CompactView t={t} zoom={0.24} collisions={collisions} statuses={statuses} />);
  });
}

describe('CompactView', () => {
  it("draws the connector's own mark when it has one", () => {
    show([status('openclaw', { label: 'OC', tint: '#ff4d4d', svg: 'M1 1 L2 2 Z' })]);
    expect(host.querySelector('.far-mark-svg path')?.getAttribute('d')).toBe('M1 1 L2 2 Z');
    // The letters must not ALSO appear: one agent, one identity.
    expect(host.textContent).not.toContain('OC');
  });

  it('falls back to the label when the connector ships no drawing', () => {
    // A connector without a logo still has to name itself from here, rather
    // than becoming a blank card with a number on it.
    show([status('claude-code', { label: 'CC', tint: '#c96442' })]);
    expect(host.querySelector('.far-mark-svg')).toBeNull();
    // The class, not just the letters: it carries the weight and the uppercase,
    // so a label that lost it would still read "CC" while looking wrong.
    expect(host.querySelector('.far-mark')?.textContent).toBe('CC');
  });

  it('counts collisions without multiplying them', () => {
    // It read "1 × sessions vivantes sur la même branche" — a multiplication
    // sign standing where a plain count belongs. Dashboard prints
    // "{n} {collision}", and the two surfaces must not disagree.
    show([], 3);
    expect(host.textContent).toContain(`3 ${t.collision}`);
    expect(host.textContent).not.toContain('×');
  });

  it('says nothing-is-connected rather than showing zero agents', () => {
    // An app nobody has pointed anywhere is not an app with no agents working,
    // and the two must not look alike even from here.
    show([]);
    expect(host.textContent).toContain(t.hubNotSet);
  });
});
