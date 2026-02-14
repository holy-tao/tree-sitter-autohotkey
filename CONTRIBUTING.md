# Contributing

## Developer setup

### Requirements:

You will need:
- The [tree-sitter cli](https://tree-sitter.github.io/tree-sitter/creating-parsers/1-getting-started.html#installation)
- NodeJS
- The C compiler of your choice

## Testing

### Running Tests

```bash
# Run all tests
make test
# or
tree-sitter test

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
- `literals.txt` - Literal values (numeric, string, boolean, unset)
- `expressions.txt` - Expression sequences and compositions
- `operators.txt` - All operator types
- `variables.txt` - Variable declarations and identifiers

### Test Format

Tests use the standard tree-sitter corpus format:

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
