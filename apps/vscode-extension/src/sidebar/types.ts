import type { GuidedSessionState } from "@duckwalk/core";
import type { GuidedSession } from "@duckwalk/schema";

export type GuidanceMode = "suggest" | "hover" | "peek" | "inline" | "diff";

export type WalkthroughDriftState = {
  status: "fresh" | "stale";
  issues: string[];
};

export type WebviewState = {
  session: GuidedSession | null;
  guidedState: GuidedSessionState | null;
  activeStepId: string | null;
  activeEvidenceId: string | null;
  walkthroughDrift: WalkthroughDriftState | null;
  isPlaying: boolean;
  guidanceMode: GuidanceMode;
  tabAcceptEnabled: boolean;
  error: string | null;
};

export type SidebarMessage =
  | { type: "start-session" }
  | { type: "next-step" }
  | { type: "previous-step" }
  | { type: "toggle-playback" }
  | { type: "set-guidance-mode"; mode: GuidanceMode }
  | { type: "toggle-tab-accept" }
  | { type: "refresh-session" }
  | { type: "complete-step" }
  | { type: "undo-complete-step" }
  | { type: "set-step-completion"; stepId: string; complete: boolean }
  | { type: "select-evidence"; stepId: string; evidenceId: string }
  | { type: "select-step"; stepId: string; evidenceId?: string | undefined }
  | { type: "open-file"; path: string };

export interface SidebarController {
  handleSidebarMessage(message: SidebarMessage): Promise<void>;
}
