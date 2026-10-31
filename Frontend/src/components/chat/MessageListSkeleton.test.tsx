import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageListSkeleton, SidebarListSkeleton } from "./MessageListSkeleton";
import { NewMessagesLine } from "./MessageRow";
import { SHORTCUTS } from "@/components/app/ShortcutsDialog";

const render = (n: React.ReactElement) => renderToStaticMarkup(n);

describe("loading + marker components", () => {
  it("message skeleton is an accessible status shaped like rows", () => {
    const html = render(<MessageListSkeleton rows={4} />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading messages");
    expect(html.match(/h-9 w-9/g)?.length).toBe(4);
    expect(html).toContain("animate-skeleton");
  });

  it("sidebar skeleton renders the requested rows", () => {
    expect(render(<SidebarListSkeleton rows={3} />).match(/h-4 w-4/g)?.length).toBe(3);
  });

  it("New messages line is a labelled separator", () => {
    const html = render(<NewMessagesLine />);
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-label="New messages"');
  });

  it("shortcut list covers the palette, channel switching and help", () => {
    const labels = SHORTCUTS.flatMap((g) => g.items.map((i) => i.label)).join(" | ");
    expect(labels).toContain("Jump to");
    expect(labels).toContain("Previous channel");
    expect(labels).toContain("Show this list");
  });
});
