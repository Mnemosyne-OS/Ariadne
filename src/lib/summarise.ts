/**
 * Session summary and tone reading.
 *
 * Only the human turns are sent — roughly 1% of a transcript's bytes (doc 93
 * §1). That is not only cheaper, it is the only part worth summarising: the
 * other 99% is tool output the model would just be re-reading.
 */
import type { SessionState } from '@mnemosyne_os/agent-transcripts';

/** Bytes of human turns allowed into one prompt. A long session is trimmed to
 *  its most recent turns rather than refused: the tail is what the person
 *  usually wants summarised, and a silent truncation would be worse than a
 *  stated one. */
const MAX_PROMPT_CHARS = 14000;

const LANGUAGE_NAME: Record<string, string> = {
  en: 'English', fr: 'French', es: 'Spanish',
  de: 'German', pt: 'Portuguese', ru: 'Russian', zh: 'Chinese',
};

export interface SummaryRequest {
  session: SessionState;
  ownerName: string;
  withTone: boolean;
  lang: string;
}

/** What actually went into the prompt, so the UI can say when it trimmed. */
export interface PromptBuild {
  systemPrompt: string;
  prompt: string;
  turnsUsed: number;
  turnsTotal: number;
}

export function buildSummaryPrompt(req: SummaryRequest): PromptBuild {
  const { session, ownerName, withTone, lang } = req;
  const language = LANGUAGE_NAME[lang.slice(0, 2)] ?? 'English';
  const owner = ownerName.trim();

  // Newest turns first into the budget, then restored to chronological order:
  // a session that overflows should keep its ending, not its beginning.
  const kept: typeof session.humanTurns = [];
  let budget = MAX_PROMPT_CHARS;
  for (let i = session.humanTurns.length - 1; i >= 0; i--) {
    const turn = session.humanTurns[i];
    const cost = turn.text.length + 12;
    if (cost > budget) break;
    budget -= cost;
    kept.unshift(turn);
  }

  const who = owner ? `${owner}'s assistant` : 'the assistant of the person you are writing for';
  const systemPrompt = [
    `You are Mnemosyne, ${who}. You write in the first person, as the assistant.`,
    `Write in ${language}.`,
    '',
    'You are given ONLY the messages the person typed during one working session',
    'with a coding agent. You never saw the agent\'s replies or the tool output.',
    'Say what the session was about and what was decided, in 3 to 5 sentences.',
    '',
    'Rules you do not break:',
    '- Never invent an outcome. If the messages do not say whether something',
    '  worked, say that it is not visible in what you can read.',
    '- Never claim to have seen code, files or results. You read messages only.',
    '- No preamble, no heading, no bullet list. Plain sentences.',
  ].join('\n');

  const toneBlock = withTone ? [
    '',
    'Then add a line starting with "TONE:" giving your reading of the tone of',
    'these messages. Rules for that line:',
    '- Describe the TONE OF THE SESSION, never the person. "The messages get',
    '  terser after the third attempt" is allowed. "He was frustrated" is not.',
    '- Quote or point at what you are reading it from. A tone with no evidence',
    '  is a guess dressed as an observation.',
    '- If the messages are too few or too neutral to read, say exactly that.',
    '  An honest "not readable" beats a confident invention.',
    '- One or two sentences.',
  ].join('\n') : '';

  const header = [
    `Session: ${session.sessionId ?? 'unknown'}`,
    `Project: ${session.projectPath ?? 'unknown'} (branch ${session.branch ?? 'unknown'})`,
    session.artifacts.length
      ? `Files the agent wrote: ${session.artifacts.slice(0, 12).map(a => short(a.path)).join(', ')}`
      : 'No file was written in what is readable here.',
    '',
    `The person's messages, in order (${kept.length} of ${session.humanTurns.length}):`,
    '',
  ].join('\n');

  const body = kept.map((t, i) => `[${i + 1}] ${t.text}`).join('\n\n');

  return {
    systemPrompt: systemPrompt + toneBlock,
    prompt: header + body,
    turnsUsed: kept.length,
    turnsTotal: session.humanTurns.length,
  };
}

/** Splits the model's answer into the summary and the tone line, if any. */
export function splitToneLine(text: string): { summary: string; tone: string | null } {
  const idx = text.search(/^\s*TONE\s*:/im);
  if (idx < 0) return { summary: text.trim(), tone: null };
  const tone = text.slice(idx).replace(/^\s*TONE\s*:\s*/i, '').trim();
  return { summary: text.slice(0, idx).trim(), tone: tone || null };
}

function short(p: string): string {
  return p.split(/[\\/]/).slice(-2).join('/');
}
