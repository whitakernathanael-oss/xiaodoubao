const { existsSync, readFileSync, rmSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function outputDirectory(projectRoot) {
  const root = path.resolve(projectRoot);
  const output = path.resolve(root, "out");
  if (path.dirname(output) !== root || path.basename(output) !== "out") {
    throw new Error("Refusing to clean an unexpected release directory");
  }
  return output;
}

function removeOldOutput(projectRoot) {
  const output = outputDirectory(projectRoot);
  rmSync(output, { recursive: true, force: true });
  return output;
}

function artifactPaths(projectRoot) {
  return {
    setup: path.resolve(projectRoot, "out/make/squirrel.windows/x64/豆包皮肤版-Setup.exe"),
    portable: path.resolve(projectRoot, "out/doubao-autoskin-win32-x64/豆包皮肤版.exe")
  };
}

function main() {
  if (process.platform !== "win32") throw new Error("release:win requires Windows");
  const projectRoot = path.resolve(__dirname, "..");
  const packageJson = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8"));
  if (packageJson.name !== "doubao-autoskin") throw new Error("Unexpected project root");

  removeOldOutput(projectRoot);
  const result = spawnSync("npm.cmd", ["run", "make"], {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false
  });
  if (result.status !== 0) process.exit(result.status ?? 1);

  const artifacts = artifactPaths(projectRoot);
  for (const file of Object.values(artifacts)) {
    if (!existsSync(file)) throw new Error(`Release artifact is missing: ${file}`);
  }
  console.log(`豆包皮肤版 v${packageJson.version}`);
  console.log(`Setup: ${artifacts.setup}`);
  console.log(`Portable: ${artifacts.portable}`);
}

if (require.main === module) main();

module.exports = { artifactPaths, removeOldOutput };
