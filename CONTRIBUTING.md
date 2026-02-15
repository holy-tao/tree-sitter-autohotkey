# Contributing

## Developer setup

### Requirements:

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

Package using tree sitter. It can also generate a .wasm binary, but why would you want that
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

See [testing](#testing-1) for details on this process

## Testing

### Running Tests

The tests run in GitHub actions pipelines on push and pull-request. You can also trigger a run manually. To run tests locally:
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

I'm not usually a fan of test-driven development, but it will serve you well as you make changes to the grammar. It's trivial to check what runs and what doesn't, it is much less trivial to debug the parser. AutoHotkey lacks a real specification, so decisions on what is and isn't allowed boil down to what the interpreter will let you do.

### Test Format

Tests use the standard tree-sitter [corpus format](https://tree-sitter.github.io/tree-sitter/creating-parsers/5-writing-tests.html). This validates the parser output against a tree-sitter [s-expression](https://tree-sitter.github.io/tree-sitter/using-parsers/queries/1-syntax.html):

```
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
