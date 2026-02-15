# tree-sitter-autohotkey 
[![Test Grammar](https://github.com/holy-tao/tree-sitter-autohotkey/actions/workflows/test.yml/badge.svg)](https://github.com/holy-tao/tree-sitter-autohotkey/actions/workflows/test.yml)

Tree-sitter grammar for AutoHotkey v2.

## Usage

Start with the [using parsers](https://tree-sitter.github.io/tree-sitter/using-parsers/index.html) section of the tree-sitter documentation. This grammar is not structurally any different from any other tree-sitter grammar.

You can grab a compiled binary and the c source files from the latest successful [ci run](https://github.com/holy-tao/tree-sitter-autohotkey/actions/workflows/test.yml).

### Known Differences From the AHK Interpreter

The grammar chooses simplicity over correctness in a few places, mostly to avoid contextual lexing and parsing. Not anywhere that will cause it to parse totally incorrect AutoHotkey scripts, but those trying to use the grammar should be aware of the following notes:
- The grammar allows the [scope modifiers](https://www.autohotkey.com/docs/v2/Functions.htm#Locals) `local` and `global` in a few places where they're actually illegal. These are contextual and trivial to filter for in situations where that context is available (when walking the tree, for example):
  - Class property declarations
  - Variable declarations in the [auto-execute](https://www.autohotkey.com/docs/v2/Scripts.htm#auto) section
  - Function (including method, see below) declarations
    - Related, the grammar permits [static function](https://www.autohotkey.com/docs/v2/Functions.htm#static-functions) declarations in the auto-execute section 
- The grammar makes no distinction between method and function declarations. A method is simply a function attached to an object, therefore a method *declaration* is simply a function declaration inside the body of a class declaration
- The grammar doesn't currently filter identifiers for keywords - `local := 1` will be parsed as a valid assignment operation, though `local` is reserved.
- The grammer permits `else if` clauses in `try` and `for` statements
- The grammar permits `continue` and `break` statements outside of loops

There is no official AutoHotkey grammar - the source of truth is whatever the interpreter will let you get away with. If you find that the interpreter lets you do something the grammar doesn't, please open an issue. If you find that the *grammar* permits something that the interpreter doesn't, I might not fix it.

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for development setup and testing guidelines
