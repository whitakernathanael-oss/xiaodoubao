import { spawn, execFile } from "node:child_process";
import { access } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { DoubaoAdapter } from "../shared/contracts";
import { fetchTargets, type CdpTarget, type TargetFetch } from "./cdp";

type Environment = Record<string, string | undefined>;
type AccessFile = (path: string) => Promise<void>;
type SpawnDoubao = (
  executable: string,
  args: string[],
  options: { detached: true; stdio: "ignore"; windowsHide: true }
) => { pid?: number; unref(): void };
type RunningProbe = () => Promise<boolean>;
type ProcessRunner = (file: string, args: string[], options: { windowsHide: true }) => Promise<{ stdout: string; stderr: string }>;

export type DoubaoPortStatus =
  | { kind: "connected"; targets: CdpTarget[] }
  | { kind: "restart-required" }
  | { kind: "stopped" }
  | { kind: "port-conflict" };

export function candidateDoubaoPaths(environment: Environment = process.env): string[] {
  const candidates = [
    environment.LOCALAPPDATA && path.win32.join(environment.LOCALAPPDATA, "Doubao", "Application", "Doubao.exe"),
    environment.ProgramFiles && path.win32.join(environment.ProgramFiles, "Doubao", "Application", "Doubao.exe"),
    environment["ProgramFiles(x86)"] && path.win32.join(environment["ProgramFiles(x86)"]!, "Doubao", "Application", "Doubao.exe")
  ];
  return candidates.filter((candidate): candidate is string => Boolean(candidate));
}

export async function findDoubaoExecutable(
  candidates = candidateDoubaoPaths(),
  accessFile: AccessFile = access
): Promise<string | undefined> {
  for (const candidate of candidates) {
    try { await accessFile(candidate); return candidate; } catch { /* Try the next standard path. */ }
  }
  return undefined;
}

export function buildDoubaoArgs(port: number): string[] {
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error("Remote debugging port is invalid");
  return [
    "--remote-debugging-address=127.0.0.1",
    `--remote-debugging-port=${port}`
  ];
}

export function launchDoubao(
  executable: string,
  port: number,
  spawnProcess: SpawnDoubao = spawn
): { pid?: number } {
  if (!path.win32.isAbsolute(executable) || path.win32.extname(executable).toLowerCase() !== ".exe") {
    throw new Error("Doubao executable path is invalid");
  }
  const child = spawnProcess(executable, buildDoubaoArgs(port), {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();
  return { pid: child.pid };
}

async function doubaoIsRunning(): Promise<boolean> {
  const result = await promisify(execFile)("tasklist.exe", [
    "/FI", "IMAGENAME eq Doubao.exe", "/FO", "CSV", "/NH"
  ], { windowsHide: true });
  return result.stdout.toLowerCase().includes("doubao.exe");
}

export async function probeDoubaoPort(
  port: number,
  adapter: DoubaoAdapter,
  options: {
    fetcher?: TargetFetch;
    isRunning?: () => Promise<boolean>;
  } = {}
): Promise<DoubaoPortStatus> {
  try {
    const targets = await fetchTargets(port, adapter, options.fetcher);
    return targets.length > 0 ? { kind: "connected", targets } : { kind: "port-conflict" };
  } catch {
    return await (options.isRunning ?? doubaoIsRunning)()
      ? { kind: "restart-required" }
      : { kind: "stopped" };
  }
}

export async function closeDoubaoGracefully(
  confirmed: boolean,
  isRunning: RunningProbe = doubaoIsRunning
): Promise<boolean> {
  if (!confirmed) throw new Error("Explicit restart confirmation is required");
  return !await isRunning();
}

export async function closeDoubaoForRestart(
  runProcess: ProcessRunner = (file, args, options) => promisify(execFile)(file, args, options)
): Promise<boolean> {
  try {
    const listed = await runProcess("tasklist.exe", ["/FI", "IMAGENAME eq Doubao.exe", "/FO", "CSV", "/NH"], { windowsHide: true });
    if (!/"Doubao\.exe","\d+"/i.test(listed.stdout)) return true;
    await runProcess("taskkill.exe", ["/IM", "Doubao.exe", "/T", "/F"], { windowsHide: true });
    const remaining = await runProcess("tasklist.exe", ["/FI", "IMAGENAME eq Doubao.exe", "/FO", "CSV", "/NH"], { windowsHide: true });
    return !/"Doubao\.exe","\d+"/i.test(remaining.stdout);
  } catch {
    return false;
  }
}
