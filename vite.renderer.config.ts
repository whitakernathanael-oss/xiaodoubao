import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src/renderer",
  build: { outDir: path.resolve(process.cwd(), ".vite", "renderer", "main_window") }
});
