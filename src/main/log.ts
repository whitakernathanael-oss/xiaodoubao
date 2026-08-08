import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export interface LogEvent {
  stage: string;
  errorType?: string;
  targetUrl?: string;
  matchCounts?: Record<string, number>;
  status?: string;
}

export interface LogWriter {
  write(event: LogEvent): Promise<void>;
}

export class PrivacyLog implements LogWriter {
  private queue = Promise.resolve();

  constructor(
    private readonly file: string,
    private readonly maxBytes = 2 * 1024 * 1024,
    private readonly now: () => string = () => new Date().toISOString()
  ) {}

  write(event: LogEvent): Promise<void> {
    this.queue = this.queue.then(() => this.writeNow(event));
    return this.queue;
  }

  private async writeNow(event: LogEvent): Promise<void> {
    const safe = {
      timestamp: this.now(),
      stage: String(event.stage).slice(0, 80),
      ...(event.errorType ? { errorType: String(event.errorType).slice(0, 120) } : {}),
      ...(event.targetUrl ? { targetUrl: String(event.targetUrl).split(/[?#]/, 1)[0].slice(0, 300) } : {}),
      ...(event.status ? { status: String(event.status).slice(0, 40) } : {}),
      ...(event.matchCounts ? {
        matchCounts: Object.fromEntries(Object.entries(event.matchCounts)
          .filter(([, count]) => Number.isFinite(count))
          .map(([key, count]) => [key.slice(0, 60), count]))
      } : {})
    };
    await mkdir(path.dirname(this.file), { recursive: true });
    await appendFile(this.file, `${JSON.stringify(safe)}\n`, "utf8");
    const bytes = await readFile(this.file);
    if (bytes.byteLength <= this.maxBytes) return;
    let newest = bytes.subarray(bytes.byteLength - this.maxBytes);
    const newline = newest.indexOf(10);
    if (newline >= 0 && newline + 1 < newest.byteLength) newest = newest.subarray(newline + 1);
    await writeFile(this.file, newest);
  }

  async read(): Promise<string> {
    await this.queue;
    try { return await readFile(this.file, "utf8"); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
      throw error;
    }
  }
}
