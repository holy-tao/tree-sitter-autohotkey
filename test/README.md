# Test Corpus Organization

This directory contains corpus tests for the AutoHotkey v2 grammar.

## File Organization

- **directives.txt** - Directive statements (#Requires, #Include, #HotIf, #DllLoad, etc.)
- **assignments.txt** - Assignment operations with all operators (`:=`, `+=`, `-=`, `*=`, etc.)
- **literals.txt** - Literal values:
  - Numeric: integers, floats, hex (0xFF)
  - Strings: double-quoted, single-quoted, with escapes
  - Boolean: true/false (case-insensitive)
  - Unset keyword
- **expressions.txt** - Expression sequences and compositions (parenthesized, multiline, comma-separated)
- **operators.txt** - All operator types:
  - Math: `+`, `-`, `*`, `/`, `//`
  - Logical: `&&`, `and`, `||`, `or`
  - Bitwise: `&`, `|`, `^`
  - Comparison: `>`, `<`, `>=`, `<=`, `=`, `==`, `!=`, `!==`, `is`
  - Prefix/Postfix: `++`, `--`
- **variables.txt** - Variable declarations with scope identifiers (global, local, static)

## Test Format

Each test follows the standard tree-sitter corpus format:

```
================================================================================
Descriptive Test Name
================================================================================

source code to parse

--------------------------------------------------------------------------------

(expected_parse_tree_as_s_expression)
```

## Running Tests

From the project root:

```bash
tree-sitter test              # Run all tests
tree-sitter test -u           # Update expected outputs
tree-sitter test -i 'name'    # Run tests matching pattern
tree-sitter test -d           # Debug mode
```

## Test Attributes

- `:skip` - Skip this test (for unimplemented grammar features)
- `:error` - Expect parse errors in output
- `:fail-fast` - Stop test suite if this test fails

## Adding New Tests

1. Choose the appropriate file based on the feature being tested
2. Add a new test block with descriptive name
3. Write the source code to test
4. Leave the expected output section empty
5. Run `tree-sitter test -u` to auto-generate the expected parse tree
6. Verify the generated output is correct
7. Run `tree-sitter test` to ensure all tests still pass

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for more details.
