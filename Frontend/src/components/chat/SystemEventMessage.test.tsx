import { describe, expect, it } from "vitest";
import { parseSystemEvent, welcomeIndex } from "./SystemEventMessage";

describe("join / leave lines", () => {
  it("reads who did what from the backend sentence", () => {
    expect(parseSystemEvent("omar_m joined the community")).toEqual({ kind: "joined", name: "omar_m" });
    expect(parseSystemEvent("nadia was added to the community")).toEqual({ kind: "added", name: "nadia" });
    expect(parseSystemEvent("bilal left the community")).toEqual({ kind: "left", name: "bilal" });
    expect(parseSystemEvent("x was removed from the community").kind).toBe("removed");
    expect(parseSystemEvent("y was banned from the community").kind).toBe("banned");
    expect(parseSystemEvent("Something else happened").kind).toBe("other");
  });

  it("gives the same person the same welcome line", () => {
    expect(welcomeIndex("omar_m")).toBe(welcomeIndex("omar_m"));
  });
});
