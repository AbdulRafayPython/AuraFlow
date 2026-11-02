// The 11 built-in agents (summarizer, moderation, mood...) as the Agents page shows them.
import type { AgentCatalogEntry } from '@/services/aiAgentService';
import type { AgentStatus } from '@/types/agentBuilder';

// /agent/:id uses the short names; the catalog uses the longer ones for these two.
const ROUTE_IDS: Record<string, string> = { mood_tracker: 'mood', knowledge_builder: 'knowledge' };

// The server sends MySQL's 0/1 for enabled, not true/false.
const isOff = (enabled: unknown): boolean => enabled !== undefined && enabled !== null && !enabled;

export const legacyRouteId = (agentType: string): string => ROUTE_IDS[agentType] ?? agentType;

export interface LegacyStatus {
  /** Maps onto the same chip the custom agents use. */
  status: AgentStatus;
  label: string;
  /** True when there is something to switch on or off. */
  switchable: boolean;
}

/** Where this agent stands for the person looking: on for them, in their community, or not yet. */
export function legacyStatus(entry: AgentCatalogEntry, communityName?: string): LegacyStatus {
  if (entry.category === 'personal') {
    const ps = entry.personal_status;
    if (!ps?.activated) return { status: 'draft', label: 'Not on yet', switchable: false };
    return isOff(ps.enabled)
      ? { status: 'paused', label: 'Paused for you', switchable: true }
      : { status: 'active', label: 'On for you', switchable: true };
  }
  const cs = entry.community_status;
  if (!cs) return { status: 'draft', label: 'Community agent', switchable: false };
  if (!cs.installed) return { status: 'draft', label: 'Not added yet', switchable: false };
  const where = communityName ? ` in ${communityName}` : '';
  return isOff(cs.enabled)
    ? { status: 'paused', label: `Paused${where}`, switchable: true }
    : { status: 'active', label: `On${where}`, switchable: true };
}

export interface UpgradePath {
  /** The agent template that does the same job the new way. */
  template: 'faq' | 'welcome' | 'booster' | 'recap' | 'translator' | 'knowledge' | 'wellbeing';
  name: string;
  button: string;
  title: string;
  description: string;
  /**
   * What happens to the old agent: nothing, it is paused, or only its automatic posts are switched off
   * (its screens and reports keep working).
   */
  pauses: 'none' | 'agent' | 'nudges';
  /** True when the old agent must already be installed in the community (the Summarizer is a personal agent, so it is not). */
  needsInstall: boolean;
  /** The twin is the person's own agent, not a community's (it reads their private data). */
  personal?: boolean;
}

// Only the built-in agents with a new-style twin. Support and Summarizer keep part of their own job:
// Support suggests answers unasked, Summarizer writes summaries on request and on a schedule.
const UPGRADE_PATHS: Record<string, UpgradePath> = {
  auto_message: {
    template: 'welcome', name: 'Welcome Bot', pauses: 'agent', needsInstall: true,
    button: 'Switch to the new Welcome agent',
    title: 'Switch to the new Welcome agent?',
    description: 'A new Welcome agent will greet people who join this community, and the old Auto Message agent will be paused. You can turn the old one back on any time.',
  },
  support: {
    template: 'faq', name: 'FAQ Bot', pauses: 'none', needsInstall: true,
    button: 'Add an FAQ agent',
    title: 'Add an FAQ agent?',
    description: "A new FAQ agent will answer when someone @mentions it, using this community's saved FAQs. The Support agent keeps suggesting answers on its own.",
  },
  engagement: {
    template: 'booster', name: 'Booster Bot', pauses: 'nudges', needsInstall: true,
    button: 'Switch to the new Community Booster',
    title: 'Switch to the new Community Booster?',
    description: "A new Community Booster will start conversations when a channel goes quiet, and the old Engagement agent stops posting on its own. Its reports and charts keep working. To turn the old posts back on, use Admin, Agent Goals.",
  },
  translator: {
    template: 'translator', name: 'Translator Bot', pauses: 'none', needsInstall: false,
    button: 'Add a translator you can @mention',
    title: 'Add a translator agent?',
    description: 'A new agent will translate any text when someone @mentions it. Translating messages for you in the chat stays with the Translator.',
  },
  knowledge_builder: {
    template: 'knowledge', name: 'Keeper Bot', pauses: 'none', needsInstall: true,
    button: 'Add a knowledge keeper you can @mention',
    title: 'Add a knowledge keeper?',
    description: 'A new agent will answer what the community knows when someone @mentions it, and save what a channel decided when asked (you approve each save). The Knowledge Builder keeps collecting on its own.',
  },
  wellness: {
    template: 'wellbeing', name: 'Wellbeing Buddy', pauses: 'none', needsInstall: false, personal: true,
    button: 'Switch to the new Wellbeing Buddy',
    title: 'Switch to the new Wellbeing Buddy?',
    description: "A Wellbeing Buddy of your own will check in with you by DM when your mood dips, and you can write back to it. Only you see it. While it is on, the old Wellness agent stops its pop-up check-ins; its other screens keep working. It needs Mood Tracker on.",
  },
  summarizer: {
    template: 'recap', name: 'Recap Bot', pauses: 'none', needsInstall: false,
    button: 'Add a topic recap agent',
    title: 'Add a topic recap agent?',
    description: 'A new agent will post a short recap in the channel when a conversation moves on to a new topic. Summaries on request and on a schedule stay with the Summarizer.',
  },
};

/** The new-style twin for a built-in agent, if it has one. Most are made for a community, so one must be picked. */
export function upgradePath(entry: AgentCatalogEntry, hasCommunity = true): UpgradePath | undefined {
  const path = UPGRADE_PATHS[entry.agent_type];
  if (path?.personal) return path;
  if (!path || !hasCommunity) return undefined;
  const installed = entry.category === 'community' && !!entry.community_status?.installed;
  return path.needsInstall && !installed ? undefined : path;
}
