// Recent emoji (hover toolbar) and :shortcode: lookup (composer autocomplete).

const RECENT_KEY = "auraflow-recent-emoji";
const DEFAULT_RECENT = ["👍", "✅", "🎉"];
const RECENT_MAX = 8;

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

/** Most recent first; padded with defaults so the toolbar always has `count` emoji. */
export function getRecentEmoji(count = 3, storage: StorageLike | null = defaultStorage()): string[] {
  let stored: string[] = [];
  try {
    const raw = storage?.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) stored = parsed.filter((e): e is string => typeof e === "string");
  } catch {
    stored = [];
  }
  const merged = [...stored, ...DEFAULT_RECENT.filter((e) => !stored.includes(e))];
  return merged.slice(0, count);
}

export function recordEmoji(emoji: string, storage: StorageLike | null = defaultStorage()): void {
  if (!emoji) return;
  try {
    const raw = storage?.getItem(RECENT_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const list: string[] = Array.isArray(parsed) ? parsed : [];
    const next = [emoji, ...list.filter((e) => e !== emoji)].slice(0, RECENT_MAX);
    storage?.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable: recents are a convenience only */
  }
}

/** Common shortcodes, enough for `:tada:`-style typing. */
export const EMOJI_SHORTCODES: Record<string, string> = {
  smile: "😄", grin: "😁", joy: "😂", laughing: "😆", wink: "😉", blush: "😊", heart_eyes: "😍",
  thinking: "🤔", neutral_face: "😐", sob: "😭", cry: "😢", angry: "😠", scream: "😱", sunglasses: "😎",
  pray: "🙏", clap: "👏", wave: "👋", ok_hand: "👌", muscle: "💪", raised_hands: "🙌", point_up: "☝️",
  thumbsup: "👍", "+1": "👍", thumbsdown: "👎", "-1": "👎", eyes: "👀", fire: "🔥", tada: "🎉",
  sparkles: "✨", star: "⭐", rocket: "🚀", heart: "❤️", broken_heart: "💔", "100": "💯", check: "✅",
  white_check_mark: "✅", x: "❌", warning: "⚠️", bulb: "💡", memo: "📝", pushpin: "📌", bell: "🔔",
  lock: "🔒", key: "🔑", coffee: "☕", pizza: "🍕", beer: "🍺", cake: "🎂", gift: "🎁", party: "🥳",
  bug: "🐛", wrench: "🔧", hammer: "🔨", gear: "⚙️", books: "📚", calendar: "📅", clock: "🕐",
  sun: "☀️", moon: "🌙", rainbow: "🌈", cloud: "☁️", zap: "⚡", snowflake: "❄️", seedling: "🌱",
  dog: "🐶", cat: "🐱", robot: "🤖", ghost: "👻", skull: "💀", poop: "💩", handshake: "🤝",
};

export interface ShortcodeMatch {
  /** Text typed after the colon. */
  query: string;
  /** Index of the leading ":" in the input. */
  start: number;
}

/** The `:query` token that ends at `caret`, if the user is mid-shortcode. */
export function findShortcodeToken(text: string, caret: number): ShortcodeMatch | null {
  const upto = text.slice(0, caret);
  const m = /(^|\s):([a-z0-9_+-]{2,})$/i.exec(upto);
  if (!m) return null;
  return { query: m[2].toLowerCase(), start: upto.length - m[2].length - 1 };
}

export function searchShortcodes(query: string, limit = 6): Array<{ name: string; emoji: string }> {
  const q = query.toLowerCase();
  const names = Object.keys(EMOJI_SHORTCODES);
  const starts = names.filter((n) => n.startsWith(q));
  const contains = names.filter((n) => !n.startsWith(q) && n.includes(q));
  return [...starts, ...contains].slice(0, limit).map((name) => ({ name, emoji: EMOJI_SHORTCODES[name] }));
}

/** Replace the `:query` token with `emoji ` and report the new caret position. */
export function applyShortcode(
  text: string,
  match: ShortcodeMatch,
  caret: number,
  emoji: string,
): { value: string; caret: number } {
  const before = text.slice(0, match.start);
  const after = text.slice(caret);
  const insert = `${emoji} `;
  return { value: before + insert + after, caret: (before + insert).length };
}
