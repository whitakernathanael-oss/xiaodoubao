import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { isThemeId } from "../shared/contracts";

export interface ActiveSkinState {
  version: 1;
  themeId: string;
  port: number;
  doubaoExecutable: string;
  updatedAt: string;
}

function valid(value: unknown): value is ActiveSkinState {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return item.version === 1
    && typeof item.themeId === "string" && isThemeId(item.themeId)
    && Number.isInteger(item.port) && (item.port as number) >= 1 && (item.port as number) <= 65_535
    && typeof item.doubaoExecutable === "string" && item.doubaoExecutable.length > 0
    && typeof item.updatedAt === "string" && !Number.isNaN(Date.parse(item.updatedAt));
}

export class SkinStateStore {
  constructor(private readonly file: string) {}

  async load(): Promise<ActiveSkinState | undefined> {
    try {
      const value: unknown = JSON.parse(await readFile(this.file, "utf8"));
      return valid(value) ? value : undefined;
    } catch {
      return undefined;
    }
  }

  async save(state: ActiveSkinState): Promise<void> {
    if (!valid(state)) throw new Error("Active skin state is invalid");
    await mkdir(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp-${randomUUID()}`;
    try {
      await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, "utf8");
      await rename(temporary, this.file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }

  async disable(): Promise<void> {
    await rm(this.file, { force: true });
  }
}
