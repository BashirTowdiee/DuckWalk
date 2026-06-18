import type { GuidedSessionState } from "@guidedpatch/core";
import type { GuidedSession } from "@guidedpatch/schema";

export type WebviewState = {
  session: GuidedSession | null;
  guidedState: GuidedSessionState | null;
  activeStepId: string | null;
  isPlaying: boolean;
  error: string | null;
};

export type SidebarMessage =
  | { type: "start-session" }
  | { type: "next-step" }
  | { type: "previous-step" }
  | { type: "toggle-playback" }
  | { type: "refresh-session" }
  | { type: "complete-step" }
  | { type: "select-step"; stepId: string };

export interface SidebarController {
  handleSidebarMessage(message: SidebarMessage): Promise<void>;
}
