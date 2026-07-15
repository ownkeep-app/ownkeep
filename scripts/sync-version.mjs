import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/* global console */

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const packagePath = join(rootDir, "package.json");
const tauriConfigPath = join(rootDir, "src-tauri", "tauri.conf.json");
const cargoTomlPath = join(rootDir, "src-tauri", "Cargo.toml");
const cargoLockPath = join(rootDir, "src-tauri", "Cargo.lock");

const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
const appVersion = packageJson.version;

if (typeof appVersion !== "string" || !/^\d+\.\d+$/.test(appVersion)) {
  throw new Error("package.json version must use OwnKeep's main.minor format, e.g. 0.1 or 1.2");
}

const toolVersion = `${appVersion}.0`;

function writeIfChanged(path, nextContent) {
  const currentContent = readFileSync(path, "utf8");

  if (currentContent !== nextContent) {
    writeFileSync(path, nextContent);
  }
}

function syncTauriConfig() {
  const config = JSON.parse(readFileSync(tauriConfigPath, "utf8"));
  config.version = toolVersion;
  writeIfChanged(tauriConfigPath, `${JSON.stringify(config, null, 2)}\n`);
}

function syncCargoToml() {
  const cargoToml = readFileSync(cargoTomlPath, "utf8");
  const nextCargoToml = cargoToml.replace(
    /(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/,
    `$1${toolVersion}$3`,
  );

  if (nextCargoToml === cargoToml && !cargoToml.includes(`version = "${toolVersion}"`)) {
    throw new Error("Could not find [package] version in src-tauri/Cargo.toml");
  }

  writeIfChanged(cargoTomlPath, nextCargoToml);
}

function syncCargoLock() {
  if (!existsSync(cargoLockPath)) {
    return;
  }

  const cargoLock = readFileSync(cargoLockPath, "utf8");
  const nextCargoLock = cargoLock.replace(
    /(\[\[package\]\]\nname = "ownkeep"\nversion = ")([^"]+)(")/,
    `$1${toolVersion}$3`,
  );

  writeIfChanged(cargoLockPath, nextCargoLock);
}

syncTauriConfig();
syncCargoToml();
syncCargoLock();

console.log(`Synced package-tool versions to ${toolVersion} from package.json ${appVersion}.`);
