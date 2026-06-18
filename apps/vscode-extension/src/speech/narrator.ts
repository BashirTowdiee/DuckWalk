import type { GuidedStep } from "@duckwalk/schema";

export interface StepNarrator {
  speak(step: GuidedStep): Promise<void>;
  stop(): Promise<void>;
  isAvailable(): boolean;
}

export class NoopStepNarrator implements StepNarrator {
  async speak(_step: GuidedStep): Promise<void> {}

  async stop(): Promise<void> {}

  isAvailable(): boolean {
    return false;
  }
}
