import { describe, expect, it } from 'vitest';
import type { AgentCatalogEntry } from '@/services/aiAgentService';
import { legacyRouteId, legacyStatus, upgradePath } from './legacyAgents';

const base = { display_name: 'X', description: '', icon: '', default_settings: {}, features: [] };
const personal = (ps: AgentCatalogEntry['personal_status']): AgentCatalogEntry =>
  ({ ...base, agent_type: 'wellness', category: 'personal', personal_status: ps });
const community = (cs?: AgentCatalogEntry['community_status']): AgentCatalogEntry =>
  ({ ...base, agent_type: 'moderation', category: 'community', community_status: cs });

describe('legacyRouteId', () => {
  it('uses the short page names for mood and knowledge only', () => {
    expect(legacyRouteId('mood_tracker')).toBe('mood');
    expect(legacyRouteId('knowledge_builder')).toBe('knowledge');
    expect(legacyRouteId('summarizer')).toBe('summarizer');
  });
});

describe('legacyStatus', () => {
  it('personal agents: on, paused, or not on yet', () => {
    expect(legacyStatus(personal({ activated: true, enabled: true }))).toMatchObject({ status: 'active', label: 'On for you', switchable: true });
    expect(legacyStatus(personal({ activated: true, enabled: false }))).toMatchObject({ status: 'paused', switchable: true });
    expect(legacyStatus(personal({ activated: true, enabled: 0 as unknown as boolean }))).toMatchObject({ status: 'paused' });
    expect(legacyStatus(personal({ activated: true, enabled: 1 as unknown as boolean }))).toMatchObject({ status: 'active' });
    expect(legacyStatus(personal({ activated: false }))).toMatchObject({ status: 'draft', switchable: false });
    expect(legacyStatus(personal(undefined))).toMatchObject({ status: 'draft', switchable: false });
  });

  it('community agents: named community, paused, not added, or no community picked', () => {
    expect(legacyStatus(community({ installed: true, enabled: true }), 'CS Department')).toMatchObject({ status: 'active', label: 'On in CS Department', switchable: true });
    expect(legacyStatus(community({ installed: true, enabled: false }), 'CS Department')).toMatchObject({ status: 'paused', label: 'Paused in CS Department' });
    expect(legacyStatus(community({ installed: false }))).toMatchObject({ status: 'draft', label: 'Not added yet', switchable: false });
    expect(legacyStatus(community(undefined))).toMatchObject({ label: 'Community agent', switchable: false });
  });
});

describe('upgradePath', () => {
  const installed = (agent_type: string): AgentCatalogEntry =>
    ({ ...base, agent_type, category: 'community', community_status: { installed: true, enabled: true } });

  it('offers a twin once the agent is in the community', () => {
    expect(upgradePath(installed('auto_message'))).toMatchObject({ template: 'welcome', pauses: 'agent' });
    expect(upgradePath(installed('support'))).toMatchObject({ template: 'faq', pauses: 'none' });
    expect(upgradePath(installed('engagement'))).toMatchObject({ template: 'booster', pauses: 'nudges' });
    expect(upgradePath(installed('knowledge_builder'))).toMatchObject({ template: 'knowledge', pauses: 'none' });
  });

  it('offers twins for the personal Summarizer and Translator once a community is picked', () => {
    const personalAgent = (agent_type: string): AgentCatalogEntry =>
      ({ ...base, agent_type, category: 'personal', personal_status: { activated: true } });
    expect(upgradePath(personalAgent('summarizer'))).toMatchObject({ template: 'recap', pauses: 'none' });
    expect(upgradePath(personalAgent('translator'))).toMatchObject({ template: 'translator', pauses: 'none' });
    expect(upgradePath(personalAgent('summarizer'), false)).toBeUndefined();
    expect(upgradePath(personalAgent('wellness'))).toMatchObject({ template: 'wellbeing', personal: true });
    expect(upgradePath(personalAgent('wellness'), false)).toMatchObject({ template: 'wellbeing' });   // personal: no community needed
  });

  it('offers nothing for the others, or when the agent is not in the community', () => {
    expect(upgradePath(installed('moderation'))).toBeUndefined();
    expect(upgradePath({ ...installed('support'), community_status: { installed: false } })).toBeUndefined();
    expect(upgradePath({ ...installed('support'), community_status: undefined })).toBeUndefined();
    expect(upgradePath({ ...installed('support'), category: 'personal' })).toBeUndefined();
  });
});
