import type { DoubaoAdapter } from "../shared/contracts";
import { probePage } from "./adapter-store";
import type { CdpTarget } from "./cdp";
import type { InjectionResult } from "./injector";
import type { LogWriter } from "./log";
import type { ThemeBundle } from "./theme-store";

export type WorkflowStatus = {
  kind: "not-running" | "restart-required" | "connecting" | "applied" | "partial" | "incompatible" | "error";
};

export interface WorkflowSession {
  evaluate(expression: string): Promise<unknown>;
  close(): void;
  onEvent?(method: string, listener: () => void): () => void;
}

export interface WorkflowInjector {
  apply(theme: ThemeBundle["theme"], wallpaperDataUrl: string, extraCss?: string): Promise<InjectionResult>;
  restore(): Promise<void>;
}

export interface WorkflowDependencies {
  loadBundle(id: string): Promise<ThemeBundle>;
  loadAdapter(): Promise<DoubaoAdapter>;
  fetchTargets(port: number, adapter: DoubaoAdapter): Promise<CdpTarget[]>;
  connect(url: string): Promise<WorkflowSession>;
  createInjector(session: WorkflowSession, adapter: DoubaoAdapter): WorkflowInjector;
  log: LogWriter;
}

function selectorProbeExpression(adapter: DoubaoAdapter): string {
  const selectors = [...new Set(Object.values(adapter.regions).flat())];
  return `(() => {
    const counts = {};
    for (const selector of ${JSON.stringify(selectors)}) {
      try { counts[selector] = document.querySelectorAll(selector).length; }
      catch { counts[selector] = 0; }
    }
    return { counts };
  })()`;
}

function mime(name: string): string {
  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  return extension === ".png" ? "image/png" : extension === ".webp" ? "image/webp" : "image/jpeg";
}

function dataUrl(bundle: ThemeBundle): string {
  return `data:${mime(bundle.asset.name)};base64,${Buffer.from(bundle.asset.bytes).toString("base64")}`;
}

export class SkinWorkflow {
  private status: WorkflowStatus = { kind: "not-running" };
  private readonly active = new Map<string, { session: WorkflowSession; injector: WorkflowInjector }>();

  constructor(private readonly dependencies: WorkflowDependencies) {}

  getStatus(): WorkflowStatus {
    return this.status;
  }

  hasActiveSessions(): boolean {
    return this.active.size > 0;
  }

  private disconnectActive(): void {
    for (const { session } of this.active.values()) session.close();
    this.active.clear();
  }

  async apply(id: string, port: number): Promise<WorkflowStatus> {
    this.status = { kind: "connecting" };
    this.disconnectActive();
    try {
      const [bundle, adapter] = await Promise.all([
        this.dependencies.loadBundle(id),
        this.dependencies.loadAdapter()
      ]);
      const targets = await this.dependencies.fetchTargets(port, adapter);
      if (targets.length === 0) {
        this.status = { kind: "incompatible" };
        await this.dependencies.log.write({ stage: "target", status: this.status.kind });
        return this.status;
      }

      let applied = 0;
      let partial = false;
      for (const target of targets) {
        const session = await this.dependencies.connect(target.webSocketDebuggerUrl);
        const raw = await session.evaluate(selectorProbeExpression(adapter));
        const counts = raw && typeof raw === "object" && (raw as { counts?: unknown }).counts
          ? (raw as { counts: Record<string, number> }).counts
          : {};
        const targetKind = adapter.targets.find((entry) => target.url.startsWith(entry.urlPrefix))?.kind;
        const settingsMatched = adapter.regions.settingsPanel.some((selector) => (counts[selector] ?? 0) > 0);
        const pageState = targetKind === "settings" || settingsMatched ? "settings" : "chat";
        const probe = probePage((selector) => counts[selector] ?? 0, adapter, pageState);
        await this.dependencies.log.write({
          stage: "probe",
          targetUrl: target.url,
          status: probe.status,
          matchCounts: Object.fromEntries(Object.entries(probe.matches).map(([region, match]) => [region, match?.count ?? 0]))
        });
        if (probe.status === "incompatible") {
          partial = true;
          session.close();
          continue;
        }
        const injector = this.dependencies.createInjector(session, adapter);
        const result = await injector.apply(bundle.theme, dataUrl(bundle), bundle.extraCss);
        if (result.status === "incompatible") {
          partial = true;
          session.close();
          continue;
        }
        applied += 1;
        if (result.status === "partial" || probe.status === "partial") partial = true;
        this.active.set(target.id, { session, injector });
      }
      this.status = applied === 0 ? { kind: "incompatible" }
        : partial ? { kind: "partial" }
          : { kind: "applied" };
      await this.dependencies.log.write({ stage: "apply", status: this.status.kind });
      return this.status;
    } catch (error) {
      this.disconnectActive();
      this.status = { kind: "error" };
      await this.dependencies.log.write({
        stage: "apply",
        status: "error",
        errorType: error instanceof Error ? error.name : "UnknownError"
      });
      return this.status;
    }
  }

  async restore(port: number): Promise<void> {
    try {
      if (this.active.size > 0) {
        for (const { injector, session } of this.active.values()) {
          await injector.restore();
          session.close();
        }
        this.active.clear();
      } else {
        const adapter = await this.dependencies.loadAdapter();
        const targets = await this.dependencies.fetchTargets(port, adapter);
        for (const target of targets) {
          const session = await this.dependencies.connect(target.webSocketDebuggerUrl);
          await this.dependencies.createInjector(session, adapter).restore();
          session.close();
        }
      }
      this.status = { kind: "not-running" };
      await this.dependencies.log.write({ stage: "restore", status: "complete" });
    } catch (error) {
      this.status = { kind: "error" };
      await this.dependencies.log.write({
        stage: "restore", status: "error",
        errorType: error instanceof Error ? error.name : "UnknownError"
      });
      throw error;
    }
  }

  dispose(): void {
    this.disconnectActive();
  }
}
