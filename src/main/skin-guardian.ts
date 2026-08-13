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
  restartRunningDoubao?(state: ActiveSkinState, isCurrent: () => boolean): Promise<boolean>;
  reportError?(stage: "guardian-takeover", error: unknown): void | Promise<void>;
  rollback?(themeId: string): Promise<void>;
  delay(milliseconds: number, callback: () => void): ReturnType<typeof setTimeout>;
  cancel?(timer: ReturnType<typeof setTimeout>): void;
}

const BACKOFF = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

export class SkinGuardian {
  private stopped = false;
  private launched = false;
  private applied = false;
  private takeoverPending = false;
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
      this.takeoverPending = false;
      return "disabled";
    }
    const probe = await this.dependencies.probe(state.port);
    if (!this.current(generation)) return "disabled";
    if (probe.kind === "restart-required") {
      this.applied = false;
      this.launched = false;
      if (this.dependencies.shouldRestartRunningDoubao?.()) {
        this.takeoverPending = true;
        try {
          const restarted = await this.dependencies.restartRunningDoubao?.(state, () => this.current(generation));
          if (!this.current(generation)) return "disabled";
          if (!restarted) {
            await this.report(new Error("restart returned false"));
            return "retry";
          }
          return "retry";
        } catch (error) {
          await this.report(error);
          return "retry";
        }
      }
      return "waiting-for-restart";
    }
    if (probe.kind === "stopped") {
      this.applied = false;
      this.launched = false;
      if (this.takeoverPending) {
        try {
          if (!this.current(generation)) return "disabled";
          this.dependencies.launch(state.doubaoExecutable, state.port);
        } catch (error) {
          await this.report(error);
        }
        return "retry";
      }
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
    if (this.applied) this.takeoverPending = false;
    return this.applied ? "applied" : "retry";
  }

  async start(): Promise<void> {
    this.stopped = false;
    this.retry = 0;
    this.generation += 1;
    await this.tick(this.generation);
  }

  async startAlreadyApplied(): Promise<void> {
    this.applied = true;
    await this.start();
  }

  stop(): void {
    this.stopped = true;
    this.takeoverPending = false;
    this.generation += 1;
    if (this.timer) (this.dependencies.cancel ?? clearTimeout)(this.timer);
    this.timer = undefined;
  }

  private current(generation: number): boolean {
    return !this.stopped && generation === this.generation;
  }

  private async tick(generation: number): Promise<void> {
    let result: GuardianResult;
    try {
      result = await this.runOnce(generation);
    } catch (error) {
      await this.report(error);
      result = "retry";
    }
    if (!this.current(generation) || result === "disabled") return;
    let delay: number;
    if (result === "applied") {
      this.retry = 0;
      delay = 5_000;
    } else if (result === "waiting-for-doubao") {
      this.retry = 0;
      delay = 750;
    } else {
      delay = BACKOFF[this.retry];
      this.retry = Math.min(this.retry + 1, BACKOFF.length - 1);
    }
    this.timer = this.dependencies.delay(delay, () => { void this.tick(generation); });
  }

  private async report(error: unknown): Promise<void> {
    try { await this.dependencies.reportError?.("guardian-takeover", error); } catch { /* Reporting must not stop recovery. */ }
  }
}
