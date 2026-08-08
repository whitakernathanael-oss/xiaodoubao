import path from "node:path";

export function resolveDataPaths(localAppData = process.env.LOCALAPPDATA): {
  root: string;
  themes: string;
  adapter: string;
  logs: string;
} {
  if (!localAppData) throw new Error("LOCALAPPDATA is unavailable");
  const root = path.join(localAppData, "DoubaoSkin");
  return {
    root,
    themes: path.join(root, "themes"),
    adapter: path.join(root, "doubao-adapter.json"),
    logs: path.join(root, "logs")
  };
}
