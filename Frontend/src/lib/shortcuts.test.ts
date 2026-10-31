import { describe, expect, it } from "vitest";
import { adjacentChannel, isTypingTarget } from "./shortcuts";

describe("adjacentChannel", () => {
  const ids = [10, 20, 30];
  it("moves down and up", () => {
    expect(adjacentChannel(ids, 10, 1)).toBe(20);
    expect(adjacentChannel(ids, 30, -1)).toBe(20);
  });
  it("wraps at both ends", () => {
    expect(adjacentChannel(ids, 30, 1)).toBe(10);
    expect(adjacentChannel(ids, 10, -1)).toBe(30);
  });
  it("starts at the ends when no channel is selected or it is unknown", () => {
    expect(adjacentChannel(ids, undefined, 1)).toBe(10);
    expect(adjacentChannel(ids, 99, -1)).toBe(30);
  });
  it("returns null with no channels", () => {
    expect(adjacentChannel([], 1, 1)).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("treats inputs, textareas, selects and contenteditable as typing", () => {
    expect(isTypingTarget({ tagName: "INPUT" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true } as unknown as EventTarget)).toBe(true);
  });
  it("does not for buttons, body or null", () => {
    expect(isTypingTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

import { readableTextOn } from "./utils";

describe("readableTextOn", () => {
  it("uses dark text on light colours and white on dark ones", () => {
    expect(readableTextOn("#fee75c")).toBe("#111");
    expect(readableTextOn("#ffffff")).toBe("#111");
    expect(readableTextOn("#1e2371")).toBe("#fff");
    expect(readableTextOn("#4338ca")).toBe("#fff");
  });
  it("falls back to white for missing or invalid colours", () => {
    expect(readableTextOn(undefined)).toBe("#fff");
    expect(readableTextOn("not-a-colour")).toBe("#fff");
  });
});
