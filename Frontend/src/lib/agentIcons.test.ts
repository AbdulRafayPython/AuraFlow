import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { AGENT_ICON_KEYS, agentIconKey, agentIconSrc } from './agentIcons';

describe('agentIconKey', () => {
  it('gives Aura its own logo', () => {
    expect(agentIconKey({ name: 'Aura', builtin: true })).toBe('aura');
  });

  it('matches by name or handle', () => {
    expect(agentIconKey({ name: 'Campus FAQ' })).toBe('support');
    expect(agentIconKey({ name: 'Weekly Digest' })).toBe('digest');
    expect(agentIconKey({ name: 'Hostel Helper' })).toBe('housing');
    expect(agentIconKey({ username: 'welcome_bot' })).toBe('welcome');
    expect(agentIconKey({ slug: 'moderation' })).toBe('safety');
    expect(agentIconKey({ slug: 'translator' })).toBe('translate');
  });

  it('falls back to the directory category, then "other"', () => {
    expect(agentIconKey({ name: 'Zeta', category: 'learning' })).toBe('learning');
    expect(agentIconKey({ name: 'Zeta' })).toBe('other');
  });

  it('every key has a logo file in public/agents', () => {
    for (const key of AGENT_ICON_KEYS) {
      expect(existsSync(join(__dirname, '../../public', agentIconSrc(key)))).toBe(true);
    }
  });
});

describe('agentIconKey precedence', () => {
  it("uses the agent's own name before a generic slug", () => {
    expect(agentIconKey({ slug: 'assistant', name: 'Campus FAQ' })).toBe('support');
    expect(agentIconKey({ slug: 'assistant', name: 'Aura' })).toBe('aura');
    expect(agentIconKey({ slug: 'summarizer' })).toBe('digest');
  });
});
