import path from "node:path";

export function resolveDataPaths(localAppData = process.env.LOCALAPPDATA): {
  root: string;
  themes: string;
  adapter: string;
  settings: string;
  log: string;
} {
  if (!localAppData) throw new Error("LOCALAPPDATA is unavailable");
  const root = path.join(localAppData, "DoubaoSkin");
  return {
    root,
    themes: path.join(root, "themes"),
    adapter: path.join(root, "adapter", "doubao-adapter.json"),
    settings: path.join(root, "settings.json"),
    log: path.join(root, "app.log")
  };
}
