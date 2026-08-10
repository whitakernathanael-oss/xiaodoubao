import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const FILE_NAME = "DoubaoSkinGuardian.cmd";

export function windowsStartupFolder(appData = process.env.APPDATA): string {
  if (!appData) throw new Error("APPDATA is unavailable");
  return path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
}

export function startupCommandPath(startupFolder: string): string {
  return path.join(startupFolder, FILE_NAME);
}

export async function installGuardianStartup(executable: string, startupFolder: string): Promise<void> {
  if (!path.win32.isAbsolute(executable) || path.win32.extname(executable).toLowerCase() !== ".exe") {
    throw new Error("Guardian executable path is invalid");
  }
  await mkdir(startupFolder, { recursive: true });
  const command = `@echo off\r\nstart "" "${executable.replaceAll('"', '""')}" --skin-guardian\r\n`;
  await writeFile(startupCommandPath(startupFolder), command, "utf8");
}

export async function removeGuardianStartup(startupFolder: string): Promise<void> {
  await rm(startupCommandPath(startupFolder), { force: true });
}
