import { describe, expect, it } from "vitest";
import { applyShortcode, findShortcodeToken, getRecentEmoji, recordEmoji, searchShortcodes } from "./emoji";

const memoryStorage = () => {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  };
};

describe("recent emoji", () => {
  it("falls back to defaults when nothing is stored", () => {
    expect(getRecentEmoji(3, memoryStorage())).toEqual(["👍", "✅", "🎉"]);
  });

  it("puts the latest emoji first and keeps a stable length", () => {
    const store = memoryStorage();
    recordEmoji("🔥", store);
    recordEmoji("👀", store);
    expect(getRecentEmoji(3, store)).toEqual(["👀", "🔥", "👍"]);
  });

  it("moves a repeated emoji to the front without duplicating it", () => {
    const store = memoryStorage();
    recordEmoji("🔥", store);
    recordEmoji("👀", store);
    recordEmoji("🔥", store);
    expect(getRecentEmoji(2, store)).toEqual(["🔥", "👀"]);
  });

  it("survives missing or corrupt storage", () => {
    expect(getRecentEmoji(3, null)).toEqual(["👍", "✅", "🎉"]);
    const bad = { getItem: () => "{not json", setItem: () => {} };
    expect(getRecentEmoji(3, bad)).toEqual(["👍", "✅", "🎉"]);
    expect(() => recordEmoji("🔥", null)).not.toThrow();
  });
});

describe("shortcodes", () => {
  it("finds the :token ending at the caret", () => {
    expect(findShortcodeToken("great :ta", 9)).toEqual({ query: "ta", start: 6 });
    expect(findShortcodeToken(":tada", 5)).toEqual({ query: "tada", start: 0 });
  });

  it("ignores single characters, plain colons and mid-word colons", () => {
    expect(findShortcodeToken("note :a", 7)).toBeNull();
    expect(findShortcodeToken("time 10:30", 10)).toBeNull();
    expect(findShortcodeToken("hello", 5)).toBeNull();
  });

  it("searches prefix matches before substring matches", () => {
    const names = searchShortcodes("ta").map((s) => s.name);
    expect(names[0]).toBe("tada");
    expect(searchShortcodes("zzzzz")).toEqual([]);
  });

  it("replaces the token with the emoji and a trailing space", () => {
    const text = "nice :tad and more";
    const match = findShortcodeToken(text, 9)!;
    expect(applyShortcode(text, match, 9, "🎉")).toEqual({ value: "nice 🎉  and more", caret: 8 });
  });
});
