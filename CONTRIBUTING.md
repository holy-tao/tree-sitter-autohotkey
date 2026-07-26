# Contributing

## Developer setup

### Requirements

You will need:

- The [tree-sitter cli](https://tree-sitter.github.io/tree-sitter/creating-parsers/1-getting-started.html#installation)
- NodeJS
- The C compiler of your choice

## Development

### Building

```bash
# Generate parser
tree-sitter generate

# or use make
make
```

### Packaging

Package using tree sitter. It can also generate a .wasm binary, but why would you
want that

```bash
tree-sitter generate
tree-sitter build -o ./tree-sitter-autohotkey.dll
```

### Testing

Run the test suite:

```bash
make test
```

Or via the CLI:

```bash
tree-sitter test
```

See [testing](#tests) for details on this process

### Linting

`grammar.js` and `src/scanner.c` are both large files that can't reasonably be
split up, so consistency is enforced by linters rather than by convention:

```bash
make lint       # everything CI checks
make lint-fix   # apply every available autofix
```

Individually:

| Target | Tool | Config | Covers |
| --- | --- | --- | --- |
| `make lint-js` | [eslint-config-treesitter](https://www.npmjs.com/package/eslint-config-treesitter) | `eslint.config.js` | `grammar.js` |
| `make lint-md` | [markdownlint-cli2](https://github.com/DavidAnson/markdownlint-cli2) | `.markdownlint-cli2.jsonc` | all `*.md` |
| `make lint-c` | `cc -Wall -Wextra` + [clang-tidy](https://clang.llvm.org/extra/clang-tidy/) | `.clang-tidy` | `src/scanner.c` |

`lint-c` exists because the tree-sitter CLI compiles the parser for us, so scanner.c's
compiler warnings are otherwise never shown. It does a warnings-only syntax check
and then runs clang-tidy's `bugprone-*` / `clang-analyzer-*` checks. The generated
`src/parser.c` is never linted.

## Tests

### Running Tests

The tests run in GitHub actions pipelines on push and pull-request. You can also
trigger a run manually. To run tests locally:

```bash
make test
# or
tree-sitter test
```

Other commands:

```bash
# Update expected outputs after grammar changes
tree-sitter test -u

# Run specific test file
tree-sitter test -i 'directives'

# Debug failing test
tree-sitter test -d
```

### Writing Tests

Tests are located in the `test/corpus/` directory, organized by language feature:

- `directives.txt` - Directive statements (#Requires, #Include, etc.)
- `assignments.txt` - Assignment operations
- `literals.txt` - Literal values (numeric, string, boolean)
- `expressions.txt` - Expression sequences and compositions

... and so forth. Add tests to the appropriate file, add files as needed.

I'm not usually a fan of test-driven development, but it will serve you well as
you make changes to the grammar. It's trivial to check what runs and what doesn't,
it is much less trivial to debug the parser. AutoHotkey lacks a real specification,
so decisions on what is and isn't allowed boil down to what the interpreter will
let you do.

### Test Format

Tests use the standard tree-sitter [corpus format](https://tree-sitter.github.io/tree-sitter/creating-parsers/5-writing-tests.html).
This validates the parser output against a tree-sitter [s-expression](https://tree-sitter.github.io/tree-sitter/using-parsers/queries/1-syntax.html):

```text
================================================================================
Test Name Here
================================================================================

source code

--------------------------------------------------------------------------------

(expected_parse_tree)
```

### Test Attributes

- `:skip` - Temporarily disable test (for unimplemented features)
- `:error` - Test should produce parse error
- `:fail-fast` - Stop testing if this fails

### Adding New Tests

1. Add test case to appropriate file in `test/corpus/`
2. Leave expected output empty (or copy from similar test as template)
3. Run `tree-sitter test -u` to generate expected parse tree
4. Review generated output for correctness
5. Run `tree-sitter test` to verify all tests pass

### Best Practices

- One concept per test
- Test all variations of language constructs
- Include edge cases and error conditions
- Use descriptive test names
- Group related tests together
- Mark tests for unimplemented features with `:skip`
