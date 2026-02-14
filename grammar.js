/**
 * @file Tree-sitter grammar for AHK v2
 * @author Tao Beloney
 * @license Unlicense
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

export default grammar({
  name: "autohotkey",

  rules: {
    // TODO: add the actual grammar rules
    source_file: $ => "hello"
  }
});
