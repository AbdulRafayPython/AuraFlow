// Frontend/src/components/ai-agents/agentSettingsMeta.ts
//
// Plain-English metadata for the raw setting keys the backend stores against
// each agent. Shared by:
//   - pages/admin/AgentSettings.tsx     (community-level overrides)
//   - components/ai-agents/PersonalAgentsPanel.tsx (personal automations)
//
// Anything not listed falls back to a prettified version of the key, so no
// surface ever shows a developer-style snake_case name to a normal user.
//
// `min`/`max`/`step` drive slider rendering for numeric keys; `options` drives a
// <select> for enum keys. They are optional — without them a key renders as a
// plain number/text input.

export interface SettingMeta {
  label: string;
  help?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ value: string; label: string }>;
}

export const SETTING_META: Record<string, SettingMeta> = {
  // ── Auto Message ──────────────────────────────────────────────────────────
  welcome_enabled:         { label: 'Welcome new members',        help: 'Greets people with a friendly message when they join.' },
  post_in_default_channel: { label: 'Post welcomes in the main channel', help: 'Otherwise the welcome is sent quietly to the member.' },
  quick_replies_enabled:   { label: 'Suggest quick replies',      help: 'Offers one-tap reply suggestions to keep chats flowing.' },
  chips_per_message:       { label: 'Number of quick replies',    help: 'How many reply suggestions to show at once.', min: 1, max: 5, step: 1 },

  // ── Support / knowledge ───────────────────────────────────────────────────
  max_docs:                { label: 'How much to search',         help: 'How many saved documents to look through when answering a question.', min: 1, max: 20, step: 1 },
  min_score:               { label: 'Answer confidence',          help: 'Higher means the helper only answers when it’s more sure.', min: 0, max: 1, step: 0.05 },
  min_similarity_score:    { label: 'Answer confidence',          help: 'Higher means the helper only answers when it’s more sure.', min: 0, max: 1, step: 0.05 },
  show_sources:            { label: 'Show where answers came from', help: 'Adds a small note pointing to the source document.' },

  // ── Shared AI polish ──────────────────────────────────────────────────────
  use_gemini_polish:       { label: 'Use smarter AI wording',     help: 'Lets the AI refine replies for a more natural, friendly tone.' },
  gemini_polish:           { label: 'Use smarter AI wording',     help: 'Lets the AI refine replies for a more natural, friendly tone.' },
  use_gemini:              { label: 'Use smarter AI wording',     help: 'Lets the AI refine replies for a more natural, friendly tone.' },
  gemini_primary:          { label: 'Use smarter AI wording',     help: 'Lets the AI refine replies for a more natural, friendly tone.' },
  fallback_to_raw_snippet: { label: 'Show a basic answer if unsure', help: 'Falls back to a plain snippet when AI wording isn’t available.' },

  // ── Moderation ────────────────────────────────────────────────────────────
  auto_delete:             { label: 'Automatically remove bad messages', help: 'Deletes clearly harmful messages without waiting for an admin.' },
  notify_admin_on_flag:    { label: 'Alert admins when flagged',  help: 'Pings admins whenever a message is flagged for review.' },
  auto_ban_threshold:      { label: 'Auto-ban after this many strikes', help: 'A member is banned once they hit this many serious violations.', min: 1, max: 10, step: 1 },
  confidence_threshold:    { label: 'How sure before acting',     help: 'Higher means the helper only acts when it’s very confident.', min: 0, max: 1, step: 0.05 },
  moderation_mode:         { label: 'Moderation strictness',      help: 'How firmly the helper handles borderline messages.' },
  sensitivity:             { label: 'Sensitivity',                help: 'Higher catches more, but may flag harmless messages.', min: 1, max: 10, step: 1 },

  // ── Engagement / focus ────────────────────────────────────────────────────
  silence_threshold_minutes: { label: 'Quiet time before a nudge', help: 'Minutes of silence before the helper posts a conversation starter.', min: 5, max: 240, step: 5 },
  max_daily_prompts:       { label: 'Most nudges per day',        help: 'Caps how many conversation starters get posted each day.', min: 1, max: 24, step: 1 },
  drift_threshold:         { label: 'Off-topic sensitivity',      help: 'Higher catches smaller topic drifts.', min: 0, max: 1, step: 0.05 },
  consecutive_drift_limit: { label: 'Off-topic messages before a nudge', help: 'How many off-topic messages to allow before a gentle reminder.', min: 1, max: 10, step: 1 },
  channel_mode:            { label: 'Channel mode',               help: 'How focused this channel is expected to stay.' },
  hourly_analysis:         { label: 'Check every hour',           help: 'Reviews recent activity once an hour.' },

  // ── Wellness ──────────────────────────────────────────────────────────────
  auto_check:              { label: 'Check in automatically',     help: 'Watches for stress patterns on its own.' },
  burnout_detection:       { label: 'Watch for burnout',          help: 'Looks for signs of overwork and reaches out privately.' },
  break_reminders:         { label: 'Send break reminders',       help: 'Suggests short breaks during long sessions.' },
  check_interval_hours:    { label: 'How often to check (hours)',  help: 'Time between automatic check-ins.', min: 1, max: 24, step: 1 },

  // ── Knowledge builder ─────────────────────────────────────────────────────
  extraction_interval_hours: { label: 'How often to learn (hours)', help: 'Time between scans of recent chats for useful info.', min: 1, max: 24, step: 1 },
  min_confidence:          { label: 'Minimum confidence to save', help: 'Higher keeps only the clearest facts in the knowledge base.', min: 0, max: 1, step: 0.05 },

  // ── Personal automations — Mood tracker ───────────────────────────────────
  emoji_analysis:          { label: 'Read emojis too',            help: 'Takes the emojis in your messages into account when reading your mood.' },
  history_days:            { label: 'How far back to look (days)', help: 'How many days of your messages the mood timeline keeps.', min: 7, max: 90, step: 1 },
  roman_urdu:              { label: 'Understand Roman Urdu',      help: 'Reads mood from messages written in Roman Urdu, not just English.' },
  track_trends:            { label: 'Track mood trends',          help: 'Builds a private timeline so you can see how your mood shifts over time.' },
  alert_negative_trend:    { label: 'Notice low spells',          help: 'Quietly flags when your recent messages trend low — only you ever see this.' },
  track_per_message:       { label: 'Read every message',         help: 'Records a mood reading per message instead of only when a window completes.' },

  // ── Personal automations — Translator ─────────────────────────────────────
  target_language:         { label: 'Translate into',             help: 'The language messages are translated into for you.' },
  auto_translate:          { label: 'Translate automatically',    help: 'Translates incoming messages for you without asking each time.' },

  // ── Shared — language / tone (personal) ───────────────────────────────────
  language:                { label: 'Language',                   help: 'Which language this helper prefers when it writes to you.' },

  // ── Agent Goals / "Rules & limits" tunables (Backend/agents/tunables.py) ──
  // Friendly overrides for the deeper self-tuning thresholds, so the community
  // "Rules & limits" panel reads in plain words instead of backend jargon.
  expected_language:       { label: 'Translate into',            help: 'Messages in other languages get translated into this one.' },
  min_chars:               { label: 'Shortest message to translate', help: 'Very short messages are left alone.', min: 1, max: 50, step: 1 },
  score_threshold:         { label: 'How sure before answering',  help: 'Lower lets it answer more often, but it may answer when it shouldn’t.', min: 0.1, max: 0.85, step: 0.05 },
  escalation_threshold:    { label: 'When to check in on a low mood', help: 'If recent messages trend below this, Wellness reaches out privately. Lower waits for a stronger dip.', min: -0.8, max: 0, step: 0.05 },
  severity_threshold:      { label: 'How serious before acting',  help: 'Messages this severe or worse are flagged as violations.', min: 0.2, max: 0.95, step: 0.05 },
  epsilon:                 { label: 'How often it tries something new', help: 'Higher means it experiments more with different prompts instead of repeating what already worked.', min: 0, max: 0.5, step: 0.05 },
  category_rewards:        { label: 'What’s working so far',      help: 'What the helper has learned works best. View-only.' },
  template_rewards:        { label: 'What’s working so far',      help: 'Which welcome messages have landed best. View-only.' },
  min_messages:            { label: 'Messages needed before it acts', help: 'Waits until this many new messages have arrived.', min: 5, max: 80, step: 1 },
  summarise_last_n:        { label: 'How much to recap at once',  help: 'How many recent messages each recap looks at.', min: 20, max: 200, step: 5 },
  lookback_hours:          { label: 'How far back to look (hours)', help: 'How many hours of recent chat it scans for useful info.', min: 1, max: 12, step: 1 },
  quiet_hours:             { label: 'Quiet hours',               help: 'No private check-ins are sent between these hours (the member’s local time).' },
  cooldown_multiplier:     { label: 'Space between check-ins',    help: 'Higher means longer gaps between wellness messages.', min: 0.5, max: 6, step: 0.5 },
  memory_size:             { label: 'How much it remembers',      help: 'How many recent back-and-forth turns the assistant keeps in mind.', min: 2, max: 10, step: 1 },
  memory_ttl_seconds:      { label: 'How long it remembers (seconds)', help: 'A conversation is forgotten after this many seconds of no activity.', min: 300, max: 3600, step: 60 },
};

/** Look up meta for a key, falling back to a prettified version of the key. */
export function settingMeta(key: string): SettingMeta {
  if (SETTING_META[key]) return SETTING_META[key];
  // Fallback: turn `some_raw_key` into "Some raw key".
  const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return { label };
}

/** Human-readable form of a default value, for "Recommended: …" hints. */
export function formatDefault(def: unknown): string {
  if (typeof def === 'boolean') return def ? 'On' : 'Off';
  if (def === null || def === undefined) return '—';
  if (Array.isArray(def)) return def.join(', ');
  return String(def);
}
