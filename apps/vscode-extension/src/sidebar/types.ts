import type { GuidedSessionState } from "@duckwalk/core";
import type { GuidedSession } from "@duckwalk/schema";

export type GuidanceMode = "suggest" | "hover" | "peek" | "inline" | "diff";

export type WebviewState = {
  session: GuidedSession | null;
  guidedState: GuidedSessionState | null;
  activeStepId: string | null;
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
  | { type: "select-step"; stepId: string };

export interface SidebarController {
  handleSidebarMessage(message: SidebarMessage): Promise<void>;
}
