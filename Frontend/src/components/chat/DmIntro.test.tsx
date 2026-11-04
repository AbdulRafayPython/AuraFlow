import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const friendsState = {
  friends: [] as { id: number }[],
  pendingRequests: [] as { id: number; sender_id: number }[],
};
vi.mock("@/contexts/FriendsContext", () => ({
  useFriends: () => ({
    ...friendsState,
    sendFriendRequest: vi.fn(), acceptFriendRequest: vi.fn(), removeFriend: vi.fn(), blockUser: vi.fn(),
  }),
}));
vi.mock("@/components/modals/ConfirmDialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/services/statusService", () => ({ statusService: { getUserProfile: vi.fn(() => new Promise(() => {})) } }));

import DmIntro from "./DmIntro";

const base = {
  userId: 4, username: "fatima_k", displayName: "Fatima", empty: false,
  onWave: () => {}, onOpenProfile: () => {},
};

describe("DmIntro", () => {
  beforeEach(() => {
    friendsState.friends = [];
    friendsState.pendingRequests = [];
  });

  it("opens the conversation like Discord: big name, username, beginning line", () => {
    const html = renderToStaticMarkup(<DmIntro {...base} />);
    expect(html).toContain("Fatima");
    expect(html).toContain("fatima_k");
    expect(html).toContain("This is the beginning of your direct message history with");
    expect(html).not.toContain('data-testid="dm-wave"');
  });

  it("shows Orbi and a Wave button only in a brand-new DM", () => {
    const html = renderToStaticMarkup(<DmIntro {...base} empty />);
    expect(html).toContain('data-testid="dm-wave"');
    expect(html).toContain("Orbi waving hello");
    expect(html).toContain("Wave to Fatima");
  });

  it("offers the friend action that fits", () => {
    friendsState.friends = [{ id: 4 }];
    expect(renderToStaticMarkup(<DmIntro {...base} />)).toContain("Remove Friend");

    friendsState.friends = [];
    friendsState.pendingRequests = [{ id: 9, sender_id: 4 }];
    expect(renderToStaticMarkup(<DmIntro {...base} />)).toContain("Accept Friend Request");
  });

  it("keeps friend actions out of an agent's DM", () => {
    const html = renderToStaticMarkup(<DmIntro {...base} botAvatar={<span>logo</span>} />);
    expect(html).toContain("This is the start of your conversation with");
    expect(html).not.toContain("Block");
    expect(html).not.toContain("Remove Friend");
  });
});
