// Templates offered when creating a community. The channel lists mirror the
// backend's COMMUNITY_TEMPLATES (Backend/routes/channels.py), which creates
// them; keep the two in sync. Rules are only a starting point the creator
// edits before creating.
import type { CommunityTemplate } from "@/types";

export interface TemplateChannel {
  name: string;
  type: "text" | "voice";
}

export interface TemplateInfo {
  id: CommunityTemplate;
  label: string;
  /** One line under the label. */
  hint: string;
  channels: TemplateChannel[];
  rules: string[];
}

const t = (name: string): TemplateChannel => ({ name, type: "text" });
const v = (name: string): TemplateChannel => ({ name, type: "voice" });

const BASE_RULES = [
  "Be respectful. No harassment, hate speech or personal attacks.",
  "Keep it on topic and use the right channel.",
  "No spam or self-promotion.",
];

export const COMMUNITY_TEMPLATES: TemplateInfo[] = [
  { id: "own", label: "Create my own", hint: "Start with one #general channel", channels: [t("general")], rules: BASE_RULES },
  {
    id: "study",
    label: "Study group",
    hint: "Revise together and help each other",
    channels: [t("general"), t("resources"), t("homework-help"), v("study-room")],
    rules: [...BASE_RULES, "Help others learn: don't share answers to graded work."],
  },
  {
    id: "class",
    label: "Class or course",
    hint: "Announcements, assignments and notes",
    channels: [t("announcements"), t("general"), t("assignments"), t("resources"), v("lecture-hall")],
    rules: [...BASE_RULES, "Don't share answers to graded work."],
  },
  {
    id: "project",
    label: "Project team",
    hint: "Plan tasks and meet regularly",
    channels: [t("general"), t("tasks"), t("resources"), v("standup")],
    rules: [...BASE_RULES, "Don't share project files outside the team without permission."],
  },
  {
    id: "club",
    label: "Club or society",
    hint: "Events and news for members",
    channels: [t("announcements"), t("general"), t("events"), v("meeting-room")],
    rules: BASE_RULES,
  },
  {
    id: "friends",
    label: "Friends",
    hint: "Hang out and make plans",
    channels: [t("general"), t("memes"), t("plans"), v("hangout")],
    rules: ["Be kind to each other.", "No spam."],
  },
];

export const MAX_RULES = 10;
export const MAX_RULE_LENGTH = 200;

export function templateById(id: CommunityTemplate): TemplateInfo {
  return COMMUNITY_TEMPLATES.find((tpl) => tpl.id === id) ?? COMMUNITY_TEMPLATES[0];
}
