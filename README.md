# tree-sitter-autohotkey 
[![Test Grammar](https://github.com/holy-tao/tree-sitter-autohotkey/actions/workflows/test.yml/badge.svg)](https://github.com/holy-tao/tree-sitter-autohotkey/actions/workflows/test.yml)

Tree-sitter grammar for AutoHotkey v2.

## Usage

Start with the [using parsers](https://tree-sitter.github.io/tree-sitter/using-parsers/index.html) section of the tree-sitter documentation. This grammar is not structurally any different from any other tree-sitter grammar.

You can grab a compiled binary and the c source files from the latest successful [ci run](https://github.com/holy-tao/tree-sitter-autohotkey/actions/workflows/test.yml).

### Known Differences From the AHK Interpreter

The grammar is, by design, ***more permissive*** than the AutoHotkey interpreter. This is partly for reasons of laziness, partly because the AHK interpreter is extremely inconsistent and tree-sitter trades simplicity for some of the tools that would be required to handle it's inconsistencies with any reasonable amount of accuracy. It should produce an accurate parse tree for any valid AutoHotkey, but it is not intended to validate syntax and indeed will not do that. I recommmend running your script through the interpreter you intend to use with it with the [/Validate](https://www.autohotkey.com/docs/v2/Scripts.htm#cmd) flag to ensure that it does not contain syntax errors.


A reasonably complete list of known differences from the AutoHotkey interpreter follows:

- The grammar allows the [scope modifiers](https://www.autohotkey.com/docs/v2/Functions.htm#Locals) `local` and `global` in a few places where they're actually illegal. These are contextual and trivial to filter for in situations where that context is available (when walking the tree, for example):
  - Class property declarations
  - Variable declarations in the [auto-execute](https://www.autohotkey.com/docs/v2/Scripts.htm#auto) section
  - Function (including method, see below) declarations
- Related, the grammar permits [static function](https://www.autohotkey.com/docs/v2/Functions.htm#static-functions) declarations in the auto-execute section 
- It really doesn't know anything about keywords (or, for that matter, built-in functions)
  - The grammar doesn't currently filter identifiers for keywords - `local := 1` will be parsed as a valid assignment operation, though `local` is reserved.
  - The grammer permits `else if` clauses in `try` and `for` statements
  - The grammar permits `continue` and `break` statements outside of loops
- The grammar will allow illegal line continuations in a variety of places.
- The grammar allows comments in illegal places - for example, block comments inline with code.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and testing guidelines
