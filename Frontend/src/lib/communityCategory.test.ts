import { describe, expect, it } from "vitest";
import { categoriesOf, matchesCategory } from "./communityCategory";

describe("community categories", () => {
  it("classifies the demo communities from name and description", () => {
    expect(categoriesOf({ name: "CS Department", description: "Official BSCS department community. Assignments, resources, and discussions." }))
      .toEqual(expect.arrayContaining(["education", "science"]));
    expect(categoriesOf({ name: "FYP Hub", description: "Final Year Project collaboration space. Research, meetings, and progress tracking." }))
      .toContain("education");
    expect(categoriesOf({ name: "Tech Talks", description: "Casual tech discussions, tutorials, and industry news for all students." }))
      .toContain("science");
  });

  it("matches words, not fragments inside other words", () => {
    expect(categoriesOf({ name: "Physics", description: "Facts and discussion" })).not.toContain("science");
    expect(categoriesOf({ name: "Valorant squad", description: "" })).toEqual(["gaming"]);
  });

  it("home matches everything; other categories need a keyword", () => {
    const c = { name: "Random chat", description: null };
    expect(matchesCategory(c, "home")).toBe(true);
    expect(matchesCategory(c, "music")).toBe(false);
  });
});
