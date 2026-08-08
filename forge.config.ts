import type { ForgeConfig } from "@electron-forge/shared-types";
import { MakerSquirrel } from "@electron-forge/maker-squirrel";
import { MakerZIP } from "@electron-forge/maker-zip";
import { VitePlugin } from "@electron-forge/plugin-vite";

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    name: "doubao-autoskin",
    executableName: "豆包皮肤版",
    icon: "assets/icon",
    download: {
      checksums: {
        "electron-v43.3.0-win32-x64.zip": "18528bedc6a9b04bdc5efb7b803cbc3cb0e5ea6415d54046e23d464d89a00da9"
      }
    },
    ...(process.env.DOUBAO_ELECTRON_ZIP_DIR
      ? { electronZipDir: process.env.DOUBAO_ELECTRON_ZIP_DIR }
      : {}),
    extraResource: ["assets/themes", "assets/adapters"],
    ignore: [
      /^\/(?:docs|tests|tools)(?:\/|$)/,
      /^\/assets\/(?:themes|adapters)(?:\/|$)/,
      /^\/(?:out|coverage|\.worktrees)(?:\/|$)/
    ]
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({
      name: "doubao_autoskin",
      setupExe: "豆包皮肤版-Setup.exe",
      setupIcon: "assets/icon.ico",
      noMsi: true
    }),
    new MakerZIP({}, ["win32"])
  ],
  plugins: [
    new VitePlugin({
      build: [
        { entry: "src/main.ts", config: "vite.main.config.ts", target: "main" },
        { entry: "src/preload.ts", config: "vite.preload.config.ts", target: "preload" }
      ],
      renderer: [{ name: "main_window", config: "vite.renderer.config.ts" }]
    })
  ]
};

export default config;
