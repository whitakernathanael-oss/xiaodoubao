import { contextBridge, ipcRenderer } from "electron";
import { IPC_CHANNELS, type DoubaoSkinApi, type SaveThemeInput } from "./shared/ipc";

const api: DoubaoSkinApi = Object.freeze({
  listThemes: () => ipcRenderer.invoke(IPC_CHANNELS.themeList),
  loadTheme: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.themeLoad, id),
  saveTheme: (input: SaveThemeInput) => ipcRenderer.invoke(IPC_CHANNELS.themeSave, input),
  deleteTheme: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.themeDelete, id),
  duplicateTheme: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.themeDuplicate, id),
  importTheme: () => ipcRenderer.invoke(IPC_CHANNELS.themeImport),
  exportTheme: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.themeExport, id),
  chooseWallpaper: () => ipcRenderer.invoke(IPC_CHANNELS.wallpaperChoose),
  getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.adapterStatus),
  startDoubao: (port?: number) => ipcRenderer.invoke(IPC_CHANNELS.doubaoStart, port),
  confirmRestart: (port?: number) => ipcRenderer.invoke(IPC_CHANNELS.doubaoRestart, port),
  applyTheme: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.skinApply, id),
  restoreOfficial: () => ipcRenderer.invoke(IPC_CHANNELS.skinRestore),
  chooseDoubaoExecutable: () => ipcRenderer.invoke(IPC_CHANNELS.doubaoChooseExecutable)
});

contextBridge.exposeInMainWorld("doubaoSkin", api);
