/**
 * Production vault location on macOS (spec §11.1). Shown in onboarding / Settings as a static
 * path string; the live absolute path from Rust may differ in debug builds (`vault-dev.dat`).
 */
export const PRODUCTION_VAULT_PATH =
  "~/Library/Application Support/com.shaojiang.ownkeep/vault.dat";
