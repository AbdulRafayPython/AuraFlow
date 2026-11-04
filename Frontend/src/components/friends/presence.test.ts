import { describe, expect, it } from "vitest";
import { isOnline, lastSeenText } from "./presence";

describe("friends presence", () => {
  const now = new Date("2026-11-04T12:00:00Z").getTime();
  it("says when someone was last seen", () => {
    expect(lastSeenText(undefined, now)).toBeNull();
    expect(lastSeenText("2026-11-04T11:59:40Z", now)).toBe("just now");
    expect(lastSeenText("2026-11-04T11:15:00Z", now)).toBe("45m ago");
    expect(lastSeenText("2026-11-04T07:00:00Z", now)).toBe("5h ago");
    expect(lastSeenText("2026-11-03T10:00:00Z", now)).toBe("yesterday");
    expect(lastSeenText("2026-11-01T10:00:00Z", now)).toBe("3d ago");
  });
  it("counts idle and do-not-disturb as online", () => {
    expect(isOnline({ status: "idle" })).toBe(true);
    expect(isOnline({ status: "dnd" })).toBe(true);
    expect(isOnline({ status: "offline" })).toBe(false);
  });
});
