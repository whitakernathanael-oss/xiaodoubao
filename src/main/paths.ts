import path from "node:path";

export function resolveBundledPaths(isPackaged: boolean, appPath: string, resourcesPath: string): {
  themes: string;
  adapter: string;
} {
  const root = isPackaged ? resourcesPath : path.join(appPath, "assets");
  return {
    themes: path.join(root, "themes"),
    adapter: path.join(root, "adapters", "doubao-adapter.json")
  };
}

export function resolveDataPaths(localAppData = process.env.LOCALAPPDATA): {
  root: string;
  themes: string;
  adapter: string;
  settings: string;
  log: string;
  activeSkin: string;
} {
  if (!localAppData) throw new Error("LOCALAPPDATA is unavailable");
  const root = path.join(localAppData, "DoubaoSkin");
  return {
    root,
    themes: path.join(root, "themes"),
    adapter: path.join(root, "adapter", "doubao-adapter.json"),
    settings: path.join(root, "settings.json"),
    log: path.join(root, "app.log"),
    activeSkin: path.join(root, "active-skin.json")
  };
}
