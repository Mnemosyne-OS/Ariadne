/**
 * Ariadne's agent actions (doc 149): the manifest's declaration passes the
 * HOST's own check, every declared action has its handler (a declared action
 * without one would be offered to agents and fail), nothing spends credits (the
 * session summary is not exposed), nothing keeps anything in a vault (doc 93:
 * nothing reaches memory without a press), and the limits are the code's own.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { agentActionsFromManifest } from '../../../infinity-edition/src/main/plugins/cartridgeAgentActions';
import { LIST_LIMITS, TABS } from './ariadneAgent';

const root = join(__dirname, '..', '..');
const manifest = JSON.parse(readFileSync(join(root, 'mnemo-plugin.json'), 'utf8')) as unknown;
const source = readFileSync(join(root, 'src', 'lib', 'ariadneAgent.ts'), 'utf8');
const block = source.slice(source.indexOf('// agent-actions:begin'), source.indexOf('// agent-actions:end'));
const handlers = [...block.matchAll(/^ {4}(\w+): (?:async )?\(/gm)].map((m) => m[1]);

function declared() {
  const r = agentActionsFromManifest(manifest);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("Ariadne's agent actions", () => {
  it("pass the host's check of the manifest", () => {
    const r = agentActionsFromManifest(manifest);
    expect(r.ok ? 'ok' : r.error).toBe('ok');
  });

  it('every declared action has its handler, and no handler is undeclared', () => {
    expect(handlers.length).toBeGreaterThan(5);
    expect([...handlers].sort()).toEqual(declared().map((a) => a.id).sort());
  });

  it('nothing spends credits, and nothing keeps or writes into a vault', () => {
    expect(declared().filter((a) => a.effect === 'spend')).toEqual([]);
    // The handlers never reach the host themselves: no vault write, no model call can hide in them.
    expect(block).not.toMatch(/sdk\.|invoke\(|\.ingest|\.infer/);
  });

  it("the limits and the tabs it declares are the code's own", () => {
    for (const a of declared().filter((x) => x.params.limit)) {
      expect(a.params.limit).toMatchObject({ minimum: LIST_LIMITS.min, maximum: LIST_LIMITS.max });
    }
    expect(declared().find((a) => a.id === 'showTab')!.params.tab).toMatchObject({ enum: [...TABS] });
  });
});
