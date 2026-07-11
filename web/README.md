# tree-sitter-autohotkey playground

Client-react demo of the grammar, takes AHK v2.0 or v2.1 source code and presents an
interactive parse tree on theright. Parsing runs entirely in the browser via the WebAssembly
-compiled grammar.

## Stack

- React / vite / TypeScript, like everything else these days.
- [web-tree-sitter](https://www.npmjs.com/package/web-tree-sitter) loads the grammar wasm and parses
  in-browser. Pinned to `0.26.10` to match the `tree-sitter` CLI's parser ABI; these must stay in sync.
- [CodeMirror 6](https://codemirror.net/) (`@uiw/react-codemirror`) for editing and source-code
  interaction.

## Local development

Requires the `tree-sitter` CLI on your PATH (used to compile the grammar to wasm).

```bash
cd web
npm install
npm run dev      # runs build:wasm first, then starts Vite
```

Or

```bash
npm run build    # type-check + production build into dist/
npm run preview  # serve the production build locally
```
