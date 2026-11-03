// Privacy choice and rules editor, shared by "Create community" and
// Community settings so both explain the same choice the same way.
import { Check, Globe, Lock, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CommunityVisibility } from "@/types";
import { MAX_RULES, MAX_RULE_LENGTH } from "@/lib/communityTemplates";

const OPTIONS: Record<CommunityVisibility, { icon: typeof Globe; title: string; description: string; points: string[] }> = {
  public: {
    icon: Globe,
    title: "Public",
    description: "Anyone on AuraFlow can find and join it.",
    points: ["Listed in Discover and search", "People accept your rules before joining"],
  },
  private: {
    icon: Lock,
    title: "Private",
    description: "Only people you add can join.",
    points: ["Hidden from Discover and search", "Admins add members from the community menu"],
  },
};

export function PrivacyChoice({
  value, onChange, disabled = false,
}: {
  value: CommunityVisibility;
  onChange: (value: CommunityVisibility) => void;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label="Who can join" className="space-y-3">
      {(Object.keys(OPTIONS) as CommunityVisibility[]).map((key) => {
        const { icon: Icon, title, description, points } = OPTIONS[key];
        const selected = value === key;
        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(key)}
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border-2 p-4 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-60",
              selected ? "border-primary bg-primary/10" : "border-border hover:border-[hsl(var(--theme-border-hover))] hover:bg-[hsl(var(--theme-bg-hover))]",
            )}
          >
            <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", selected ? "bg-primary text-primary-foreground" : "bg-[hsl(var(--theme-bg-tertiary))] text-foreground")}>
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold text-foreground">{title}</span>
              <span className="mt-0.5 block text-sm text-[hsl(var(--theme-text-secondary))]">{description}</span>
              <ul className="mt-2 space-y-1">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0" /> {p}
                  </li>
                ))}
              </ul>
            </span>
            <span aria-hidden className={cn("mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2", selected ? "border-primary" : "border-muted-foreground")}>
              {selected && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function RulesEditor({
  rules, onChange, disabled = false,
}: {
  rules: string[];
  onChange: (rules: string[]) => void;
  disabled?: boolean;
}) {
  const count = rules.map((r) => r.trim()).filter(Boolean).length;
  return (
    <div>
      {rules.length > 0 && (
        <ol className="space-y-2">
          {rules.map((rule, i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="mt-2 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--theme-bg-tertiary))] text-xs font-semibold text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <textarea
                  value={rule}
                  rows={1}
                  disabled={disabled}
                  onChange={(e) => onChange(rules.map((r, j) => (j === i ? e.target.value.replace(/\n/g, " ").slice(0, MAX_RULE_LENGTH) : r)))}
                  placeholder="Write a rule"
                  aria-label={`Rule ${i + 1}`}
                  className="min-h-9 w-full resize-none rounded-md border border-border bg-[hsl(var(--theme-input-bg))] px-3 py-1.5 text-sm text-foreground outline-none [field-sizing:content] placeholder:text-muted-foreground focus:border-primary disabled:opacity-60"
                />
                {rule.length >= MAX_RULE_LENGTH - 20 && (
                  <p className="mt-0.5 text-right text-xs text-muted-foreground">{rule.length}/{MAX_RULE_LENGTH}</p>
                )}
              </div>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(rules.filter((_, j) => j !== i))}
                  aria-label={`Remove rule ${i + 1}`}
                  className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-[hsl(var(--theme-bg-hover))] hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {!disabled && (rules.length < MAX_RULES ? (
        <button
          type="button"
          onClick={() => onChange([...rules, ""])}
          className="mt-3 flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-primary hover:bg-primary/10"
        >
          <Plus className="h-4 w-4" /> Add a rule
        </button>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">That's the maximum of {MAX_RULES} rules.</p>
      ))}
      <p className="mt-3 text-xs text-muted-foreground">
        {count === 0
          ? "With no rules, people join straight after the preview."
          : `Joiners must tick "I agree" to these ${count} rule${count === 1 ? "" : "s"}.`}
      </p>
    </div>
  );
}
