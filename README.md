# tree-sitter-autohotkey

Tree-sitter grammar for AutoHotkey v2.

## Development

### Building

```bash
# Generate parser
tree-sitter generate

# or use make
make
```

### Testing

Run the test suite:

```bash
make test
```

The test suite uses tree-sitter's corpus format with 72+ tests covering:
- Directives (#Requires, #Include, etc.)
- Assignment operations (all operators)
- Literals (numeric, string, boolean, unset)
- Expression sequences
- Operators (math, logical, bitwise, prefix/postfix)
- Variable declarations

See [CONTRIBUTING.md](CONTRIBUTING.md) for details on writing tests.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and testing guidelines
