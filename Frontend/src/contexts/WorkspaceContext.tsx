import React, { createContext, useContext, useState, useEffect } from "react";

interface Workspace {
  id: string;
  name: string;
  logo?: string;
  description?: string;
  createdAt: string;
  members: number;
}

interface WorkspaceContextType {
  currentWorkspace: Workspace | null;
  workspaces: Workspace[];
  createWorkspace: (workspace: Omit<Workspace, "id" | "createdAt" | "members">) => void;
  joinWorkspace: (inviteCode: string) => Promise<void>;
  switchWorkspace: (id: string) => void;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => {
    const saved = localStorage.getItem("auraflow_workspaces");
    return saved ? JSON.parse(saved) : [];
  });

  const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(() => {
    const saved = localStorage.getItem("auraflow_current_workspace");
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    localStorage.setItem("auraflow_workspaces", JSON.stringify(workspaces));
  }, [workspaces]);

  useEffect(() => {
    if (currentWorkspace) {
      localStorage.setItem("auraflow_current_workspace", JSON.stringify(currentWorkspace));
    }
  }, [currentWorkspace]);

  const createWorkspace = (workspace: Omit<Workspace, "id" | "createdAt" | "members">) => {
    const newWorkspace: Workspace = {
      ...workspace,
      id: Math.random().toString(36).substr(2, 9),
      createdAt: new Date().toISOString(),
      members: 1,
    };
    
    setWorkspaces([...workspaces, newWorkspace]);
    setCurrentWorkspace(newWorkspace);
  };

  const joinWorkspace = async (inviteCode: string) => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Mock workspace based on invite code
    const newWorkspace: Workspace = {
      id: inviteCode,
      name: "Joined Workspace",
      description: "Workspace you joined via invite",
      createdAt: new Date().toISOString(),
      members: 5,
    };
    
    setWorkspaces([...workspaces, newWorkspace]);
    setCurrentWorkspace(newWorkspace);
  };

  const switchWorkspace = (id: string) => {
    const workspace = workspaces.find(w => w.id === id);
    if (workspace) {
      setCurrentWorkspace(workspace);
    }
  };

  return (
    <WorkspaceContext.Provider value={{
      currentWorkspace,
      workspaces,
      createWorkspace,
      joinWorkspace,
      switchWorkspace,
    }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within WorkspaceProvider");
  }
  return context;
}