import type { DoubaoAdapter } from "../shared/contracts";
import { isAllowedTarget } from "./adapter-store";

export interface CdpTarget {
  id: string;
  type: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
}

export type TargetFetch = (
  url: string,
  init?: RequestInit
) => Promise<{ ok: boolean; json(): Promise<unknown> }>;

function target(value: unknown): CdpTarget | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  if (["id", "type", "title", "url", "webSocketDebuggerUrl"].some((key) => typeof item[key] !== "string")) {
    return undefined;
  }
  return item as unknown as CdpTarget;
}

async function fetchHost(host: string, port: number, fetcher: TargetFetch): Promise<CdpTarget[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 2_000);
  try {
    const response = await fetcher(`http://${host}:${port}/json/list`, { signal: controller.signal });
    if (!response.ok) throw new Error(`CDP endpoint returned an error on ${host}`);
    const json = await response.json();
    if (!Array.isArray(json)) throw new Error(`CDP target list is invalid on ${host}`);
    return json.map(target).filter((item): item is CdpTarget => item !== undefined);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchTargets(
  port: number,
  adapter: DoubaoAdapter,
  fetcher: TargetFetch = fetch
): Promise<CdpTarget[]> {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("CDP port is invalid");
  const attempts = await Promise.allSettled([
    fetchHost("127.0.0.1", port, fetcher),
    fetchHost("[::1]", port, fetcher)
  ]);
  const successful = attempts.flatMap((attempt) => attempt.status === "fulfilled" ? attempt.value : []);
  if (successful.length === 0 && attempts.every((attempt) => attempt.status === "rejected")) {
    throw new Error("Doubao CDP endpoint is unavailable on loopback");
  }
  const unique = new Map<string, CdpTarget>();
  for (const item of successful) {
    if (item.webSocketDebuggerUrl && isAllowedTarget(item.url, adapter)) unique.set(item.id, item);
  }
  return [...unique.values()];
}

interface CdpSocket {
  readyState: number;
  addEventListener(type: string, listener: (event: Event) => void, options?: AddEventListenerOptions): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
  send(data: string): void;
  close(): void;
}

type PendingCall = { resolve(value: unknown): void; reject(error: Error): void };

export class CdpSession {
  private nextId = 1;
  private readonly pending = new Map<number, PendingCall>();
  private readonly eventListeners = new Map<string, Set<(params: unknown) => void>>();

  constructor(private readonly socket: CdpSocket) {
    socket.addEventListener("message", this.handleMessage);
    socket.addEventListener("close", this.handleClose);
    socket.addEventListener("error", this.handleClose);
  }

  static async connect(
    url: string,
    createSocket: (url: string) => CdpSocket = (value) => new WebSocket(value)
  ): Promise<CdpSession> {
    const socket = createSocket(url);
    if (socket.readyState !== 1) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("CDP WebSocket connection timed out")), 3_000);
        const opened = () => { clearTimeout(timer); socket.removeEventListener("error", failed); resolve(); };
        const failed = () => { clearTimeout(timer); socket.removeEventListener("open", opened); reject(new Error("CDP WebSocket connection failed")); };
        socket.addEventListener("open", opened, { once: true });
        socket.addEventListener("error", failed, { once: true });
      });
    }
    const session = new CdpSession(socket);
    await Promise.all([session.command("Runtime.enable"), session.command("Page.enable")]);
    return session;
  }

  private readonly handleMessage = (event: Event): void => {
    try {
      const message = JSON.parse(String((event as MessageEvent).data)) as {
        id?: number;
        method?: string;
        params?: unknown;
        result?: unknown;
        error?: { message?: string };
      };
      if (message.id !== undefined) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message ?? "CDP command failed"));
        else pending.resolve(message.result);
      } else if (message.method) {
        for (const listener of this.eventListeners.get(message.method) ?? []) listener(message.params);
      }
    } catch { /* Ignore malformed messages from an unrelated endpoint. */ }
  };

  private readonly handleClose = (): void => {
    for (const pending of this.pending.values()) pending.reject(new Error("CDP WebSocket closed"));
    this.pending.clear();
  };

  command(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (this.socket.readyState !== 1) return Promise.reject(new Error("CDP WebSocket is not open"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression: string): Promise<unknown> {
    const response = await this.command("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true
    }) as { result?: { value?: unknown }; exceptionDetails?: { text?: string } };
    if (response.exceptionDetails) throw new Error(response.exceptionDetails.text ?? "CDP evaluation failed");
    return response.result?.value;
  }

  onEvent(method: string, listener: (params: unknown) => void): () => void {
    const listeners = this.eventListeners.get(method) ?? new Set();
    listeners.add(listener);
    this.eventListeners.set(method, listeners);
    return () => listeners.delete(listener);
  }

  close(): void {
    this.socket.close();
    this.handleClose();
  }
}
