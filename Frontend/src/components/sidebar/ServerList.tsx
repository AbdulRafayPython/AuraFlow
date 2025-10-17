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
    <div className="flex flex-col h-full p-3 gap-3">
      <div className="flex flex-col gap-2">
        {servers.map((server) => (
          <button
            key={server.id}
            onClick={() => onServerSelect(server.id)}
            className={`w-12 h-12 rounded-lg flex items-center justify-center font-bold text-sm transition-all ${
              selectedServer === server.id
                ? "bg-blue-600 text-white"
                : "bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            {server.icon}
          </button>
        ))}
      </div>

      <div className="flex-1" />

      <div className="flex flex-col gap-2">
        <button className="w-12 h-12 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 transition-colors">
          <Plus className="w-5 h-5" />
        </button>
        <button className="w-12 h-12 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 transition-colors">
          <Settings className="w-5 h-5" />
        </button>
        <button className="w-12 h-12 rounded-lg bg-slate-800 hover:bg-slate-700 flex items-center justify-center text-slate-400 transition-colors">
          <LogOut className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}