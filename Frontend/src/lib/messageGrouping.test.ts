import { describe, expect, it } from "vitest";
import { GROUP_WINDOW_MS, formatDayLabel, indexReplies, isSameDay, startsGroup, startsNewDay } from "./messageGrouping";

const at = (iso: string, sender: number | null = 1, message_type = "text") => ({
  sender_id: sender,
  created_at: iso,
  message_type,
});

describe("startsGroup", () => {
  it("starts a group for the first message", () => {
    expect(startsGroup(undefined, at("2026-10-29T10:00:00"))).toBe(true);
  });

  it("groups the same sender within 5 minutes", () => {
    expect(startsGroup(at("2026-10-29T10:00:00"), at("2026-10-29T10:04:59"))).toBe(false);
  });

  it("splits the group after the 5 minute window", () => {
    expect(startsGroup(at("2026-10-29T10:00:00"), at("2026-10-29T10:05:01"))).toBe(true);
    expect(GROUP_WINDOW_MS).toBe(5 * 60 * 1000);
  });

  it("splits when the sender changes", () => {
    expect(startsGroup(at("2026-10-29T10:00:00", 1), at("2026-10-29T10:00:30", 2))).toBe(true);
  });

  it("splits across midnight even for the same sender", () => {
    expect(startsGroup(at("2026-10-29T23:59:00"), at("2026-10-30T00:00:10"))).toBe(true);
  });

  it("system, agent and call messages always break a group", () => {
    const text = at("2026-10-29T10:00:00");
    expect(startsGroup(at("2026-10-29T10:00:00", 1, "system"), at("2026-10-29T10:00:10"))).toBe(true);
    expect(startsGroup(text, at("2026-10-29T10:00:10", 1, "ai"))).toBe(true);
    expect(startsGroup(at("2026-10-29T10:00:00", 1, "call"), at("2026-10-29T10:00:10"))).toBe(true);
  });

  it("never groups a message with unknown sender", () => {
    expect(startsGroup(at("2026-10-29T10:00:00", null), at("2026-10-29T10:00:10", null))).toBe(true);
  });
});

describe("day helpers", () => {
  it("detects day changes", () => {
    expect(isSameDay("2026-10-29T01:00:00", "2026-10-29T23:00:00")).toBe(true);
    expect(startsNewDay(undefined, at("2026-10-29T10:00:00"))).toBe(true);
    expect(startsNewDay(at("2026-10-28T23:59:00"), at("2026-10-29T00:01:00"))).toBe(true);
    expect(startsNewDay(at("2026-10-29T08:00:00"), at("2026-10-29T09:00:00"))).toBe(false);
  });

  it("labels today and yesterday", () => {
    const now = new Date("2026-10-29T12:00:00");
    expect(formatDayLabel("2026-10-29T08:00:00", now)).toBe("Today");
    expect(formatDayLabel("2026-10-28T08:00:00", now)).toBe("Yesterday");
    expect(formatDayLabel("2026-10-20T08:00:00", now)).not.toMatch(/Today|Yesterday/);
  });
});

describe("indexReplies", () => {
  it("maps parent ids to their loaded replies", () => {
    const map = indexReplies([
      { id: 1 },
      { id: 2, reply_to_preview: { id: 1 } },
      { id: 3, reply_to_preview: { id: 1 } },
      { id: 4, reply_to_preview: null },
    ]);
    expect(map.get(1)).toEqual([2, 3]);
    expect(map.has(4)).toBe(false);
  });
});

import { firstUnreadId } from "./messageGrouping";

describe("firstUnreadId", () => {
  const msgs = [
    { id: 1, sender_id: 2 },
    { id: 2, sender_id: 1 }, // me
    { id: 3, sender_id: 3 },
    { id: 4, sender_id: 1 }, // me
    { id: 5, sender_id: 3 },
  ];
  it("counts back over other people's messages only", () => {
    expect(firstUnreadId(msgs, 1, 1)).toBe(5);
    expect(firstUnreadId(msgs, 2, 1)).toBe(3);
    expect(firstUnreadId(msgs, 3, 1)).toBe(1);
  });
  it("returns null when nothing is unread or not enough is loaded", () => {
    expect(firstUnreadId(msgs, 0, 1)).toBeNull();
    expect(firstUnreadId(msgs, 9, 1)).toBeNull();
  });
});
