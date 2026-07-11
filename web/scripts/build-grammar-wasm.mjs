// Builds the grammar's WebAssembly binary from the parent repo and copies it into
// public/ so the app can fetch it at runtime. The .wasm is a build artifact (gitignored),
// so this runs automatically before `dev` and `build` (see package.json predev/prebuild).
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..", "..");
const wasmName = "tree-sitter-autohotkey.wasm";
const builtWasm = join(repoRoot, wasmName);
const publicDir = join(here, "..", "public");
const dest = join(publicDir, wasmName);

console.log("[build-grammar-wasm] tree-sitter build --wasm (in %s)", repoRoot);
try {
  execFileSync("tree-sitter", ["build", "--wasm"], {
    cwd: repoRoot,
    stdio: "inherit",
    shell: process.platform === "win32", // resolve tree-sitter.cmd on Windows
  });
} catch (err) {
  console.error(
    "\n[build-grammar-wasm] Failed to build the wasm. Is the tree-sitter CLI installed and on PATH?",
  );
  throw err;
}

if (!existsSync(builtWasm)) {
  throw new Error(
    `[build-grammar-wasm] Expected ${builtWasm} to exist after the build.`,
  );
}

mkdirSync(publicDir, { recursive: true });
copyFileSync(builtWasm, dest);
console.log("[build-grammar-wasm] Copied %s -> %s", wasmName, dest);
