import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The site is served from https://holy-tao.github.io/tree-sitter-autohotkey/,
// so assets must resolve under that sub-path in production. `import.meta.env.BASE_URL`
// (used in src/lib/parser.ts) picks this up automatically.
export default defineConfig({
  base: "/tree-sitter-autohotkey/",
  plugins: [react()],
  // web-tree-sitter ships a .wasm we import with `?url`; Vite handles it natively.
  server: {
    // We import ../../queries/highlights.scm?raw from the parent repo, so let the dev
    // server read one level above web/. (Production builds via rollup aren't restricted.)
    fs: { allow: [".."] },
  },
});
