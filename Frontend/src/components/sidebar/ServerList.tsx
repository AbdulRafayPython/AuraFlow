import React from "react";
import { Plus, Settings, LogOut } from "lucide-react";

interface ServerListProps {
  selectedServer: string;
  onServerSelect: (serverId: string) => void;
}

export default function ServerList({ selectedServer, onServerSelect }: ServerListProps) {
  const servers = [
    { id: "1", name: "AuraFlow", icon: "A" },
    { id: "2", name: "Dev Team", icon: "D" },
  ];

  return (
    <div className="flex flex-col h-full p-3 gap-3 bg-[hsl(var(--theme-sidebar-bg))] transition-colors duration-300">
      <div className="flex flex-col gap-2">
        {servers.map((server) => (
          <button
            key={server.id}
            onClick={() => onServerSelect(server.id)}
            className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-sm transition-all ${
              selectedServer === server.id
                ? "bg-[hsl(var(--theme-accent-primary))] text-white shadow-[var(--theme-glow-primary)]"
                : "bg-[hsl(var(--theme-bg-secondary))] text-[hsl(var(--theme-text-secondary))] hover:bg-[hsl(var(--theme-bg-hover))]"
            }`}
          >
            {server.icon}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-2">
        <button className="w-12 h-12 rounded-lg bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] flex items-center justify-center text-[hsl(var(--theme-text-muted))] transition-colors">
          <Plus className="w-5 h-5" />
        </button>
        <button className="w-12 h-12 rounded-lg bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] flex items-center justify-center text-[hsl(var(--theme-text-muted))] transition-colors">
          <Settings className="w-5 h-5" />
        </button>
        <button className="w-12 h-12 rounded-lg bg-[hsl(var(--theme-bg-secondary))] hover:bg-[hsl(var(--theme-bg-hover))] flex items-center justify-center text-[hsl(var(--theme-text-muted))] transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}