import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageRow, DayDivider, RepliesLink } from "./MessageRow";
import { MessageToolbar } from "./MessageToolbar";
import { Reply } from "lucide-react";

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("MessageRow", () => {
  it("renders a header row with name and time, no bubble", () => {
    const html = render(
      <MessageRow authorName="Sarah Dev" timeLabel="2:14 PM">
        Hello team
      </MessageRow>,
    );
    expect(html).toContain("Sarah Dev");
    expect(html).toContain("2:14 PM");
    expect(html).toContain("Hello team");
    expect(html).toContain("rounded-lg"); // 36px rounded-square avatar
    expect(html).not.toContain("rounded-2xl");
  });

  it("collapses a grouped row to the body plus a hover-only time", () => {
    const html = render(
      <MessageRow authorName="Sarah Dev" timeLabel="2:14 PM" shortTimeLabel="14:14" grouped>
        Follow-up
      </MessageRow>,
    );
    expect(html).toContain('data-grouped="true"');
    expect(html).not.toContain("Sarah Dev");
    expect(html).toContain("14:14");
    expect(html).toContain("group-hover:opacity-100");
  });

  it("is hover-driven by CSS, so the row itself needs no pointer state", () => {
    const html = render(<MessageRow authorName="A" timeLabel="1:00 PM">x</MessageRow>);
    expect(html).toContain("group relative");
    expect(html).not.toContain("onmouseenter");
  });

  it("falls back to initials when there is no avatar", () => {
    expect(render(<MessageRow authorName="Ahmed Khan" timeLabel="1:00 PM">x</MessageRow>)).toContain(">AK<");
  });

  it("marks pinned rows and shows the badge slot", () => {
    const html = render(
      <MessageRow authorName="Bot" timeLabel="1:00 PM" pinned badge={<span>APP</span>}>
        x
      </MessageRow>,
    );
    expect(html).toContain("Pinned");
    expect(html).toContain("APP");
  });
});

describe("DayDivider / RepliesLink", () => {
  it("renders an accessible separator", () => {
    const html = render(<DayDivider label="Today" />);
    expect(html).toContain('role="separator"');
    expect(html).toContain("Today");
  });

  it("pluralises the reply count", () => {
    expect(render(<RepliesLink count={1} onClick={() => {}} />)).toContain("1 reply");
    expect(render(<RepliesLink count={3} onClick={() => {}} />)).toContain("3 replies");
  });
});

describe("MessageToolbar", () => {
  const toolbar = (visible = false) =>
    render(
      <MessageToolbar
        quickEmoji={["👍", "✅", "🎉"]}
        visible={visible}
        onReact={() => {}}
        onOpenPicker={() => {}}
        actions={[{ key: "reply", label: "Reply", icon: Reply, onClick: () => {} }]}
      />,
    );

  it("is a labelled toolbar with 3 quick emoji, React and the row actions", () => {
    const html = toolbar();
    expect(html).toContain('role="toolbar"');
    expect(html).toContain('aria-label="Message actions"');
    expect(html).toContain('aria-label="React with 👍"');
    expect(html).toContain('aria-label="React with 🎉"');
    expect(html).toContain('aria-label="Add reaction"');
    expect(html).toContain('aria-label="Reply"');
  });

  it("is hidden until hover or focus, unless forced visible", () => {
    expect(toolbar()).toContain("group-hover:opacity-100");
    expect(toolbar()).toContain("group-focus-within:opacity-100");
    expect(toolbar()).toContain("opacity-0");
    expect(toolbar(true)).toContain("opacity-100");
  });
});
