import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AgentRow, OnOffSwitch } from "./AgentRow";

describe("Your agents rows", () => {
  it("the on/off control is a real switch that says its state", () => {
    const on = renderToStaticMarkup(<OnOffSwitch on label="Helper on or off" onChange={() => undefined} />);
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('aria-label="Helper on or off"');
    const off = renderToStaticMarkup(<OnOffSwitch on={false} label="x" onChange={() => undefined} />);
    expect(off).toContain('aria-checked="false"');
  });

  it("a row opens only when it has somewhere to go", () => {
    const clickable = renderToStaticMarkup(<ul><AgentRow logo={null} status="active" name="Helper" statusText="On" onOpen={() => undefined} /></ul>);
    expect(clickable).toContain("<button");
    const plain = renderToStaticMarkup(<ul><AgentRow logo={null} status="paused" name="Helper" statusText="Paused" /></ul>);
    expect(plain).not.toContain("<button");
    expect(plain).toContain("Paused");
  });
});
