import { describe, expect, it, vi } from "vitest";
import {
  buildDoubaoArgs,
  candidateDoubaoPaths,
  closeDoubaoGracefully,
  findDoubaoExecutable,
  launchDoubao
} from "../src/main/doubao-launcher";

describe("Doubao launcher", () => {
  it("builds loopback-only remote debugging arguments", () => {
    expect(buildDoubaoArgs(9225)).toEqual([
      "--remote-debugging-address=127.0.0.1",
      "--remote-debugging-port=9225"
    ]);
  });

  it("prefers the standard per-user installation", () => {
    expect(candidateDoubaoPaths({ LOCALAPPDATA: "C:\\Users\\A\\AppData\\Local" })[0]).toBe(
      "C:\\Users\\A\\AppData\\Local\\Doubao\\Application\\Doubao.exe"
    );
  });

  it("returns the first existing candidate", async () => {
    const found = await findDoubaoExecutable(["C:\\missing.exe", "C:\\Doubao.exe"], async (value) => {
      if (value.includes("missing")) throw new Error("missing");
    });
    expect(found).toBe("C:\\Doubao.exe");
  });

  it("launches detached and unreferences the child", () => {
    const unref = vi.fn();
    const spawn = vi.fn(() => ({ pid: 123, unref }));

    expect(launchDoubao("C:\\Apps\\Doubao.exe", 9225, spawn)).toEqual({ pid: 123 });
    expect(spawn).toHaveBeenCalledWith(
      "C:\\Apps\\Doubao.exe",
      buildDoubaoArgs(9225),
      { detached: true, stdio: "ignore", windowsHide: true }
    );
    expect(unref).toHaveBeenCalledOnce();
  });

  it("requires explicit confirmation before graceful close", async () => {
    const run = vi.fn(async () => "closed");
    await expect(closeDoubaoGracefully(false, run)).rejects.toThrow(/confirmation/i);
    expect(run).not.toHaveBeenCalled();
    await expect(closeDoubaoGracefully(true, run)).resolves.toBe(true);
  });
});
