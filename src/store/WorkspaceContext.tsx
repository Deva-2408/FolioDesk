import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";
import type { PdfWorkspaceState } from "../types/pdf";
import {
  createInitialWorkspaceState,
  workspaceReducer,
  type WorkspaceAction,
} from "./workspaceReducer";

interface WorkspaceContextValue {
  state: PdfWorkspaceState;
  dispatch: Dispatch<WorkspaceAction>;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, createInitialWorkspaceState);

  return (
    <WorkspaceContext.Provider value={{ state, dispatch }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspaceStore(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspaceStore must be used inside a WorkspaceProvider");
  }
  return ctx;
}
