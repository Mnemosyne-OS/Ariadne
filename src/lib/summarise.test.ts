/**
 * A summary is the only thing here that spends money and speaks in the first
 * person, so what goes INTO the prompt and what the prompt forbids are both
 * part of the contract.
 */
import { describe, it, expect } from 'vitest';
import { buildSummaryPrompt, splitToneLine } from './summarise';
import type { SessionState } from '@mnemosyne_os/agent-transcripts';

const session = (over: Partial<SessionState> = {}): SessionState => ({
  file: 's.jsonl', path: 'C:/s.jsonl', sessionId: 'S1', title: null, model: null,
  projectPath: 'C:/w/proj', branch: 'main', isSidechain: false,
  firstEventAt: null, lastEventAt: '2026-08-28T11:00:00Z',
  tool: null, sizeBytes: 1, artifacts: [], artifactsCapped: false,
  humanTurns: [{ at: null, text: 'do the thing' }], tokens: null, ...over,
});

const build = (over: Partial<SessionState> = {}, opts = {}) => buildSummaryPrompt({
  session: session(over), ownerName: 'Tony', withTone: false, lang: 'fr', ...opts,
});

describe('buildSummaryPrompt', () => {
  it('sends the human turns and nothing else', () => {
    const b = build({ humanTurns: [{ at: null, text: 'the only thing I typed' }] });
    expect(b.prompt).toContain('the only thing I typed');
  });

  it('writes in the shell language', () => {
    expect(build().systemPrompt).toContain('French');
    expect(buildSummaryPrompt({
      session: session(), ownerName: '', withTone: false, lang: 'es',
    }).systemPrompt).toContain('Spanish');
  });

  it('falls back to English for a language it does not know', () => {
    expect(buildSummaryPrompt({
      session: session(), ownerName: '', withTone: false, lang: 'xx',
    }).systemPrompt).toContain('English');
  });

  it('speaks as the named person\u2019s assistant', () => {
    expect(build().systemPrompt).toContain("Tony's assistant");
  });

  it('omits the name rather than inventing one when it is empty', () => {
    const b = buildSummaryPrompt({
      session: session(), ownerName: '   ', withTone: false, lang: 'en',
    });
    expect(b.systemPrompt).not.toContain("'s assistant");
  });

  it('forbids inventing an outcome and claiming to have seen code', () => {
    const p = build().systemPrompt;
    expect(p).toContain('Never invent an outcome');
    expect(p).toContain('Never claim to have seen code');
  });

  it('says there was no file rather than leaving the line out', () => {
    expect(build({ artifacts: [] }).prompt).toContain('No file was written');
  });

  it('lists the files that were written', () => {
    expect(build({ artifacts: [{ path: 'C:/w/proj/src/a.ts', origin: 'tool' as const, at: null }] }).prompt)
      .toContain('src/a.ts');
  });

  describe('when the session overflows the budget', () => {
    const many = Array.from({ length: 400 }, (_, i) => ({
      at: null, text: `turn ${i} ` + 'x'.repeat(200),
    }));

    it('reports how many turns of how many were used', () => {
      const b = build({ humanTurns: many });
      expect(b.turnsTotal).toBe(400);
      expect(b.turnsUsed).toBeLessThan(400);
      expect(b.turnsUsed).toBeGreaterThan(0);
    });

    it('keeps the END of the session, not its beginning', () => {
      const b = build({ humanTurns: many });
      expect(b.prompt).toContain('turn 399');
      expect(b.prompt).not.toContain('turn 0 ');
    });
  });

  describe('tone', () => {
    it('is absent from the prompt unless asked for', () => {
      expect(build().systemPrompt).not.toContain('TONE:');
    });

    it('when asked, forbids describing the person and demands evidence', () => {
      const p = build({}, { withTone: true }).systemPrompt;
      expect(p).toContain('TONE:');
      expect(p).toContain('never the person');
      expect(p).toContain('A tone with no evidence');
      expect(p).toContain('not readable');
    });
  });
});

describe('splitToneLine', () => {
  it('separates the tone line from the summary', () => {
    const r = splitToneLine('A summary sentence.\n\nTONE: the messages get terser.');
    expect(r.summary).toBe('A summary sentence.');
    expect(r.tone).toBe('the messages get terser.');
  });

  it('returns a null tone when the model did not write one', () => {
    const r = splitToneLine('Only a summary.');
    expect(r.summary).toBe('Only a summary.');
    expect(r.tone).toBeNull();
  });

  it('is case-insensitive about the marker', () => {
    expect(splitToneLine('Sum.\ntone: quiet.').tone).toBe('quiet.');
  });

  it('treats an empty tone line as no tone at all', () => {
    expect(splitToneLine('Sum.\nTONE:').tone).toBeNull();
  });
});
