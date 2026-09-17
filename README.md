# tree-sitter-autohotkey

[![Test Grammar](https://github.com/holy-tao/tree-sitter-autohotkey/actions/workflows/test.yml/badge.svg)](https://github.com/holy-tao/tree-sitter-autohotkey/actions/workflows/test.yml)
![Crates.io Version](https://img.shields.io/crates/v/tree-sitter-autohotkey)

Tree-sitter grammar for AutoHotkey v2.

## Usage

Start with the [using parsers] section of the tree-sitter documentation. This
grammar is not structurally any different from any other tree-sitter grammar.

You can grab a compiled binary and the c source files from the latest successful
[ci run].

[ci run]: https://github.com/holy-tao/tree-sitter-autohotkey/actions/workflows/test.yml
[using parsers]: https://tree-sitter.github.io/tree-sitter/using-parsers/index.html

### Known Differences From the AHK Interpreter

The grammar is, by design, ***more permissive*** than the AutoHotkey interpreter.
This is partly for reasons of laziness, partly because the AHK lexing is often
contextual and tree-sitter lexing is context-free. It should produce an accurate
parse tree for any valid AutoHotkey, but it is not intended to validate syntax
and indeed will not do that. I recommmend running your script through the
interpreter you intend to use with it with the [/Validate] flag to ensure that it
does not contain syntax errors.

[/Validate]: https://www.autohotkey.com/docs/v2/Scripts.htm#cmd

A reasonably complete list of known differences from the AutoHotkey interpreter
follows:

- The grammar allows the [scope modifiers] `local` and `global` in a few places
  where they're actually illegal. These are contextual and trivial to filter for
  in situations where that context is available (when walking the tree, for example):
  - Class property declarations
  - Variable declarations in the [auto-execute](https://www.autohotkey.com/docs/v2/Scripts.htm#auto)
    section
  - Function (including method, see below) declarations
- Related, the grammar permits [static function] declarations in the auto-execute
  section
- It really doesn't know anything about keywords (or, for that matter, built-in
  functions)
  - The grammar doesn't currently filter identifiers for keywords - `local := 1`
    will be parsed as a valid assignment operation, though `local` is reserved.
  - The grammer permits `else if` clauses in `try` and `for` statements
  - The grammar permits `continue` and `break` statements outside of loops
- The grammar will allow illegal line continuations in a variety of places.
- Comments are treated as [extras]. Because of this,
  - The grammar allows comments in illegal places - for example, block comments
    inline with code.
  - The grammar permits unescaped semicolons in string literals.
- The interior of a [continuation section] is **not** parsed. A continuation
  section is spliced into the surrounding line at load time and is under no
  obligation to be valid AutoHotkey on its own - only the spliced result has to
  be - so the grammar identifies the section and its options but exposes the body
  as a flat run of opaque `continuation_line` nodes. The grammar does none of the
  preprocessing (`LTrim`, [`join`] characters, escape sequences) that the
  interpreter does, and reconstructing the real statement would require it. For
  example, this is one call to `MsgBox` after splicing, but the grammar reports
  only two `continuation_line`s:

  ```autohotkey
  ( JoinB
  Msg
  ox "Hello, World!"
  )
  ```

  Multiline string literals are treated the same way, as
  `multiline_string_line` nodes. When the
  [`comments`][continuatioin-section-comments] option is present, a line stops at
  the `;` and the comment is reported separately - but the whitespace to the left
  of the comment is not trimmed off the line.

- `Throw` is treated allowed anywhere a function is, which is correct for v2.1
  but not for v2.0.

[static function]: https://www.autohotkey.com/docs/v2/Functions.htm#static-functions
[scope modifiers]: https://www.autohotkey.com/docs/v2/Functions.htm#Locals
[extras]: https://tree-sitter.github.io/tree-sitter/creating-parsers/3-writing-the-grammar.html#using-extras
[continuation section]: https://www.autohotkey.com/docs/v2/Scripts.htm#continuation-section
[continuatioin-section-comments]: https://www.autohotkey.com/docs/v2/Scripts.htm#CommentOption
[`join`]: https://www.autohotkey.com/docs/v2/Scripts.htm#Join

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for
development setup and testing guidelines
