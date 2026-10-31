import { beforeEach, describe, expect, it, vi } from "vitest";

const sonner = vi.hoisted(() => {
  const fn: any = vi.fn(() => "id-default");
  fn.error = vi.fn(() => "id-error");
  fn.success = vi.fn(() => "id-success");
  fn.info = vi.fn(() => "id-info");
  fn.warning = vi.fn(() => "id-warning");
  fn.loading = vi.fn(() => "id-loading");
  fn.dismiss = vi.fn();
  return fn;
});

vi.mock("sonner", () => ({ toast: sonner }));

import { toast } from "./use-toast";

describe("use-toast shim (sonner)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("maps title + description to sonner message + description", () => {
    toast({ title: "Saved", description: "Profile updated" });
    expect(sonner).toHaveBeenCalledWith("Saved", expect.objectContaining({ description: "Profile updated", duration: 4000 }));
  });

  it("uses description as the message when there is no title", () => {
    toast({ description: "Copied" });
    expect(sonner).toHaveBeenCalledWith("Copied", expect.objectContaining({ description: undefined }));
  });

  it("renders destructive as an error toast that lingers", () => {
    toast({ title: "Failed", variant: "destructive" });
    expect(sonner.error).toHaveBeenCalledWith("Failed", expect.objectContaining({ duration: 8000 }));
  });

  it("keeps an error with a Retry action until dismissed", () => {
    toast({ title: "Failed", variant: "destructive", action: { label: "Retry", onClick: () => {} } });
    expect(sonner.error).toHaveBeenCalledWith("Failed", expect.objectContaining({ duration: Infinity }));
  });

  it("returns a dismiss handle", () => {
    const t = toast({ title: "Hi" });
    t.dismiss();
    expect(sonner.dismiss).toHaveBeenCalledWith("id-default");
  });
});
