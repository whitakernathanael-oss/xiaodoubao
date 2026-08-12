import type { DoubaoPortStatus } from "./doubao-launcher";
import type { ActiveSkinState } from "./skin-state";
import type { WorkflowStatus } from "./workflow";

export type GuardianResult = "applied" | "waiting-for-restart" | "waiting-for-doubao" | "retry" | "disabled";

export interface SkinGuardianDependencies {
  loadState(): Promise<ActiveSkinState | undefined>;
  probe(port: number): Promise<DoubaoPortStatus>;
  launch(executable: string, port: number): unknown;
  apply(themeId: string, port: number): Promise<WorkflowStatus>;
  shouldRestartRunningDoubao?(): boolean;
  restartRunningDoubao?(port: number): Promise<boolean>;
  rollback?(themeId: string): Promise<void>;
  delay(milliseconds: number, callback: () => void): ReturnType<typeof setTimeout>;
  cancel?(timer: ReturnType<typeof setTimeout>): void;
}

const BACKOFF = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export class SkinGuardian {
  private stopped = false;
  private launched = false;
  private applied = false;
  private retry = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private generation = 0;

  constructor(private readonly dependencies: SkinGuardianDependencies) {}

  async runOnce(generation = this.generation): Promise<GuardianResult> {
    const state = await this.dependencies.loadState();
    if (!this.current(generation)) return "disabled";
    if (!state) {
      this.applied = false;
      this.launched = false;
      return "disabled";
    }
    const probe = await this.dependencies.probe(state.port);
    if (!this.current(generation)) return "disabled";
    if (probe.kind === "restart-required") {
      this.applied = false;
      this.launched = false;
      if (this.dependencies.shouldRestartRunningDoubao?.()) {
        return await this.dependencies.restartRunningDoubao?.(state.port) ? "retry" : "waiting-for-restart";
      }
      return "waiting-for-restart";
    }
    if (probe.kind === "stopped") {
      this.applied = false;
      this.launched = false;
      return "waiting-for-doubao";
    }
    if (probe.kind === "port-conflict") return "retry";
    this.launched = false;
    if (this.applied) return "applied";
    const status = await this.dependencies.apply(state.themeId, state.port);
    if (!this.current(generation)) {
      try { await this.dependencies.rollback?.(state.themeId); } catch { /* Stop must not restart recovery. */ }
      return "disabled";
    }
    this.applied = status.kind === "applied" || status.kind === "partial";
    return this.applied ? "applied" : "retry";
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.generation += 1;
    await this.tick(this.generation);
  }

  async startAlreadyApplied(): Promise<void> {
    this.applied = true;
    await this.start();
  }

  stop(): void {
    this.stopped = true;
    this.generation += 1;
    if (this.timer) (this.dependencies.cancel ?? clearTimeout)(this.timer);
    this.timer = undefined;
  }

  private current(generation: number): boolean {
    return !this.stopped && generation === this.generation;
  }

  private async tick(generation: number): Promise<void> {
    const result = await this.runOnce(generation);
    if (!this.current(generation) || result === "disabled") return;
    if (result === "applied") this.retry = 0;
    else this.retry = Math.min(this.retry + 1, BACKOFF.length - 1);
    const delay = result === "applied" ? 5_000 : result === "waiting-for-doubao" ? 750 : BACKOFF[this.retry];
    this.timer = this.dependencies.delay(delay, () => { void this.tick(generation); });
  }
}
