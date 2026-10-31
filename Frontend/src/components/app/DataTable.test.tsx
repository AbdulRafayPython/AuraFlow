import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable } from "./DataTable";
import { EmptyState, ErrorState } from "./EmptyState";
import { Section } from "./Section";
import { Users } from "lucide-react";

interface Row { id: number; name: string; members: number }
const columns = [
  { key: "name", header: "Name", cell: (r: Row) => r.name },
  { key: "members", header: "Members", cell: (r: Row) => r.members, align: "right" as const },
];
const render = (node: React.ReactElement) => renderToStaticMarkup(node);

describe("DataTable list states", () => {
  it("renders data rows with headers", () => {
    const html = render(<DataTable columns={columns} rows={[{ id: 1, name: "CS Department", members: 7 }]} rowKey={(r) => r.id} />);
    expect(html).toContain("<th");
    expect(html).toContain("CS Department");
    expect(html).toContain("tabular-nums");
  });

  it("loading shows skeleton rows shaped like the table, not data", () => {
    const html = render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} loading />);
    expect(html.match(/animate-skeleton/g)?.length).toBe(10);
    expect(html).not.toContain("Nothing here yet");
  });

  it("empty shows the next step", () => {
    const html = render(
      <DataTable columns={columns} rows={[]} rowKey={(r) => r.id} empty={{ title: "No communities", description: "Create one.", action: <button>Create</button> }} />,
    );
    expect(html).toContain("No communities");
    expect(html).toContain("Create");
  });

  it("error shows an alert with retry", () => {
    const html = render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} error="Failed to load" onRetry={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Failed to load");
    expect(html).toContain("Retry");
  });
});

describe("Section / EmptyState / ErrorState", () => {
  it("Section renders heading, help text and actions", () => {
    const html = render(<Section title="Members" description="People in this community" actions={<button>Add</button>}>body</Section>);
    expect(html).toContain("<h2");
    expect(html).toContain("People in this community");
    expect(html).toContain("Add");
    expect(html).toContain("body");
  });

  it("EmptyState is flat and has no glow or gradient", () => {
    const html = render(<EmptyState icon={Users} title="Nothing yet" />);
    expect(html).toContain("Nothing yet");
    expect(html).not.toContain("gradient");
    expect(html).not.toContain("shadow");
  });

  it("ErrorState without retry has no button", () => {
    expect(render(<ErrorState message="Boom" />)).not.toContain("<button");
  });
});
