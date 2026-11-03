// Skills: what the agent may do, in a few short groups with a switch each
// (instead of one long list of checkboxes with technical descriptions).
import React from 'react';
import { OnOffSwitch } from '@/components/agents/AgentRow';
import { TOOL_GROUPS, toolGroup, toolLabel, toolPlain } from '@/lib/agentBuilder';
import type { AgentFormValues, BuilderTool } from '@/types/agentBuilder';
import { SettingsCard } from './AgentSettingsParts';

interface Props {
  name: string;
  tools: BuilderTool[];
  values: AgentFormValues;
  set: <K extends keyof AgentFormValues>(key: K, value: AgentFormValues[K]) => void;
}

const SkillsPanel: React.FC<Props> = ({ name, tools, values, set }) => {
  const toggle = (tool: string, on: boolean) =>
    set('tools', on ? [...values.tools.filter((t) => t !== tool), tool] : values.tools.filter((t) => t !== tool));

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {name} can use {values.tools.length} of {tools.length} skills. Turn on only what it needs: fewer skills mean faster, clearer answers.
      </p>
      {TOOL_GROUPS.map((g) => {
        const items = tools.filter((t) => toolGroup(t) === g.key);
        if (items.length === 0) return null;
        const onCount = items.filter((t) => values.tools.includes(t.name)).length;
        const allOn = onCount === items.length;
        return (
          <SettingsCard
            key={g.key}
            title={g.label}
            hint={`${g.hint} ${onCount} of ${items.length} on.`}
            action={
              <button
                type="button"
                onClick={() => set('tools', allOn
                  ? values.tools.filter((t) => !items.some((i) => i.name === t))
                  : Array.from(new Set([...values.tools, ...items.map((i) => i.name)])))}
                className="shrink-0 text-sm font-medium text-[hsl(var(--theme-text-accent))] hover:underline"
              >
                {allOn ? 'Turn all off' : 'Turn all on'}
              </button>
            }
          >
            <ul className="divide-y divide-border" data-testid={`skills-${g.key}`}>
              {items.map((t) => {
                const on = values.tools.includes(t.name);
                return (
                  <li key={t.name} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{toolLabel(t.name)}</p>
                      <p className="text-sm text-muted-foreground">{toolPlain(t)}</p>
                    </div>
                    <OnOffSwitch on={on} label={toolLabel(t.name)} title={on ? 'On' : 'Off'} onChange={(next) => toggle(t.name, next)} />
                  </li>
                );
              })}
            </ul>
          </SettingsCard>
        );
      })}
    </div>
  );
};

export default SkillsPanel;
