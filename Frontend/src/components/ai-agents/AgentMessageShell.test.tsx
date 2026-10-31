import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import AgentMessageShell from "./AgentMessageShell";
import AgentThinkingIndicator from "./AgentThinkingIndicator";
import ApprovalCard from "@/components/agent-builder/ApprovalCard";
import type { AgentApproval } from "@/types/agentBuilder";

// useApprovals pulls in the socket service, which needs a browser window.
vi.mock("@/hooks/useApprovals", () => ({ decideApproval: vi.fn() }));

const render = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("AgentMessageShell", () => {
  it("is a normal message row with a small APP badge", () => {
    const html = render(
      <AgentMessageShell agentName="support" displayName="Campus FAQ" timestamp="1:03 PM">
        Library opens at 8am.
      </AgentMessageShell>,
    );
    expect(html).toContain("Campus FAQ");
    expect(html).toContain("APP");
    expect(html).toContain("1:03 PM");
    expect(html).toContain("Library opens at 8am.");
  });

  it("has no tinted card, coloured left border or glow", () => {
    const html = render(<AgentMessageShell agentName="summarizer">Body</AgentMessageShell>);
    expect(html).not.toContain("border-left");
    expect(html).not.toContain("bg-gradient");
    expect(html).not.toContain("shadow-");
    expect(html).not.toContain("backdrop-" + "blur");
  });

  it("labels scheduled posts and private recaps", () => {
    const html = render(
      <AgentMessageShell agentName="summarizer" isScheduled isPrivate>
        Weekly digest
      </AgentMessageShell>,
    );
    expect(html).toContain("Scheduled");
    expect(html).toContain("Only visible to you");
  });

  it("makes the agent name and avatar clickable only when it can open details", () => {
    const withPane = render(
      <AgentMessageShell agentName="support" displayName="Campus FAQ" onOpenAgent={() => {}}>
        x
      </AgentMessageShell>,
    );
    expect(withPane).toContain('aria-label="About Campus FAQ"');
    expect(render(<AgentMessageShell agentName="support" displayName="Campus FAQ">x</AgentMessageShell>)).not.toContain("About Campus FAQ");
  });

  it("shows one working line instead of skeleton bars in the skeleton variant", () => {
    const html = render(<AgentMessageShell agentName="knowledge_builder" variant="skeleton" skeletonLabel="Extracting knowledge" />);
    expect(html).toContain("Extracting knowledge…");
    expect(html).toContain('role="status"');
  });
});

describe("AgentThinkingIndicator", () => {
  it("renders nothing when no agent is running", () => {
    expect(render(<AgentThinkingIndicator agents={[]} />)).toBe("");
  });

  it("says '<Agent> is working…'", () => {
    const html = render(
      <AgentThinkingIndicator agents={[{ key: "1", name: "Campus FAQ", channelId: 1, since: 0 }]} />,
    );
    expect(html).toContain("Campus FAQ is working…");
    expect(html).toContain('data-testid="agent-thinking"');
  });

  it("pluralises for several agents", () => {
    const html = render(
      <AgentThinkingIndicator
        agents={[
          { key: "1", name: "Campus FAQ", channelId: 1, since: 0 },
          { key: "2", name: "Digest", channelId: 1, since: 0 },
        ]}
      />,
    );
    expect(html).toContain("Campus FAQ, Digest are working…");
  });
});

describe("ApprovalCard", () => {
  const approval: AgentApproval = {
    id: 7,
    status: "pending",
    summary: "Save a note titled Exam week plan",
    tool: "create_note",
    args: { title: "Exam week plan" },
    agent: { id: "a1", name: "Campus FAQ" },
    channel_id: 1,
    result: null,
    created_at: "2026-10-29T10:00:00Z",
    expires_at: "2099-01-01T00:00:00Z",
    decided_at: null,
  };

  it("shows who is asking, what for, the exact arguments and both buttons", () => {
    const html = render(<ApprovalCard approval={approval} />);
    expect(html).toContain("Campus FAQ needs your approval");
    expect(html).toContain("Save a note titled Exam week plan");
    expect(html).toContain("Exam week plan");
    expect(html).toContain(">Title<");
    expect(html).toContain("Approve");
    expect(html).toContain("Reject");
    expect(html).not.toContain("upper" + "case");
    expect(html).not.toContain("text-amber");
  });
});

import { humanKey, humanValue } from "@/components/agent-builder/ApprovalCard";

describe("approval details in plain words", () => {
  it("turns keys and values into readable text", () => {
    expect(humanKey("in_minutes")).toBe("In minutes");
    expect(humanValue("in_minutes", 889)).toBe("14 h 49 min");
    expect(humanValue("in_minutes", 45)).toBe("45 min");
    expect(humanValue("options", ["Yes", "No"])).toBe("Yes, No");
    expect(humanValue("text", "")).toBe("—");
  });
});
