import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import path from "node:path";

const host = process.env.TAURI_DEV_HOST;
const appPackage = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as { version: string };
const appVersion = appPackage.version;
const coverageThreshold = 95;

if (!/^\d+\.\d+$/.test(appVersion)) {
  throw new Error(
    "package.json version must use Keystash's main.minor format, e.g. 0.1 or 1.2",
  );
}

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  define: {
    __KEYSTASH_APP_VERSION__: JSON.stringify(appVersion),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/test/**",
        "src/vite-env.d.ts",
        "src/main.tsx",
        "src/modules/types.ts",
        "src/components/ui/**",
      ],
      thresholds: {
        lines: coverageThreshold,
        statements: coverageThreshold,
        functions: coverageThreshold,
        branches: coverageThreshold,
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
