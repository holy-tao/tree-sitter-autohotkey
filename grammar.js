/**
 * @file Tree-sitter grammar for AHK v2
 * @author Tao Beloney
 * @license Unlicense
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check


// precedence constants - default when unset is 0, higher number = higher precedence.

/**
 * Keyword-level precedence. E.g 'static' matches scope_identifier before identifier
 */
const KEYWORD = 5;

/**
 * NOTE: The closest thing AutoHotkey has to a formal specification is the "Language" doc: https://www.autohotkey.com/docs/v2/Language.htm
 * As the maintainer himself notes, "Gleaning the syntax from the C++ source code is probably futile, as it doesn't
 * use any kind of sane parsing strategy." (https://www.autohotkey.com/boards/viewtopic.php?t=105213)
 * 
 * Good luck!
 */
export default grammar({
  name: "autohotkey",

  conflicts: $ => [
    [$.single_expression, $.single_expression] // FIXME resolves compiler error re: VarRefs, feels wrong
  ],

  rules: {
    source_file: $ => repeat($._statement),

    _statement: $ => prec(2, choice(
      $.directive,
      $.single_expression,
      $.expression_sequence
    )),

    // conceptually, something you could put in an otherwise empty .ahk file and run without errors
    _primary_expression: $ => choice(
      $.literal,
      $.identifier,
      seq("(", $.expression_sequence, ")"),
      $._pairwise_operation
    ),

    // broader than _primary_expression, can compose other expressions (and themselves)
    single_expression: $ => choice(
      $.variable_declaration,
      $._primary_expression,
      $.assignment_operation,
      seq("&", $._primary_expression),    // VarRefs get hairy, &(a := fn()) and &%"var"% are legal
      $.prefix_operation,
      $.postfix_operation,
    ),

    expression_sequence: $ => seq(
      $.single_expression,
      repeat(seq(",", $.single_expression))
    ),

    // FIXME some declarations are contextually illegal - you can't delcare local variables in the auto-execute
    // section, for example.
    variable_declaration: $ => seq(
      $.scope_identifier,
      $.identifier
    ),

    // TODO left-hand-side can be an accessor like outer.inner but scope identifier can't precede accessor
    // TODO rhs can be literal or statement - probably primary expression
    // TODO make these fields
    assignment_operation: $ => prec.left(0, seq(
      field("left", $.single_expression),
      $.assignment_operator,
      field("right", $.single_expression)
    )),

    // Any expression like left <op> right (e.g. 2 + 2, true != false)
    _pairwise_operation: $ => choice(
      $.math_operation,
      $.comparison_operation
    ),

    // Postfix increment/decrement
    postfix_operation: $ => prec.left(2, seq(
      field("operand", $._primary_expression),
      field("operator", choice("++", "--"))
    )),

    // Prefix increment/decrement
    prefix_operation: $ => prec.right(1, seq(
      field("operator", choice("++", "--")),
      field("operand", choice($._primary_expression, $.postfix_operation))
    )),

    math_operation: $ => prec.left(0, seq(
      field("left", $.single_expression),
      $.math_operator,
      field("right", $.single_expression)
    )),

    comparison_operation: $ => prec.left(0, seq(
      field("left", $.single_expression),
      $.boolean_comparison_operator,
      field("right", $.single_expression)
    )),

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    literal: $ => choice(
      $.numeric_literal,
      $.boolean_literal,
      $.string_literal,
      $.unset         // Unset is often illegal but when it isn't it's best to treat it as a literal
    ),

    numeric_literal: $ => choice(
      /[+-]?([0-9])/,             // ints
      /[+-]?([0-9]*[.])?[0-9]+/,  // floats
      /0[xX][0-9a-fA-F]+/         // hex numbers
    ),

    boolean_literal: $ => token(
      prec(KEYWORD, choice(ci('true'), ci('false')))
    ),

    // TODO multiline string literals - https://www.autohotkey.com/docs/v2/Scripts.htm#continuation
    string_literal: $ => choice(
      seq('"', repeat($._double_quote_str_char), '"'),
      seq("'", repeat($._single_quote_str_char), "'")
    ),

    // backtick plus any non-whitespace character - ahk doesn't actually require that the backtick is
    // followed by a character that creates an escape sequence, though it will skip the backtick if it
    // isn't
    _escape_sequence: $ => /`[^\r\n\t]/,

    _double_quote_str_char: $ => choice(
      $._escape_sequence,
      /[^"\r\n]/
    ),

    _single_quote_str_char: $ => choice(
      $._escape_sequence,
      /[^'\r\n]/
    ),

    // Note: not strictly "modifiers" because declaring one can switch a function into assume-local/global mode
    scope_identifier: $ => token(
      prec(KEYWORD, choice(
        ci('static'),
        ci('local'),
        ci('global')
    ))),

    assignment_operator: $ => 
      choice( ":=", "+=", "-=", "*=", "/=", "//=", ".=", "|=", "&=", "^=", ">>=", "<<=", ">>>="),

    // "is must have whitespace, others are optional"
    comparison_operator: $ => choice(">", "<", ">=", "<=", "=", "==", "!=", "!==", ci(' is ')),

    unary_operator: $ => choice("~", "+", "-", "!"),

    math_operator: $ => choice("+", "-", "*", "/", "//"),

    bitwise_operator: $ => choice("&", "|", "^"),

    boolean_comparison_operator: $ => token(
      prec(KEYWORD, 
        choice("&&", ci('and'), "||", ci('or')
    ))),

    // Control flow keywords
    _if: $ => token(prec(KEYWORD, ci('if'))),
    _else: $ => token(prec(KEYWORD, ci('else'))),
    _while: $ => token(prec(KEYWORD, ci('while'))),
    _for: $ => token(prec(KEYWORD, ci('for'))),
    _in: $ => token(prec(KEYWORD, ci('in'))),
    _loop: $ => token(prec(KEYWORD, ci('loop'))),
    _until: $ => token(prec(KEYWORD, ci('until'))),

    unset: $ => token(prec(KEYWORD, ci('unset'))),

    // Directives - we should match these to prevent errors, but for our purposes we don't actually
    // care about their contents, except for HotIf

    // #Include, #HotIf, etc
    directive: $ => seq("#", $.directive_identifier, $.anything),

    directive_identifier: $ => token(prec(KEYWORD, choice(
      ci("clipboardtimeout"), ci("dllload"), ci("errstdout"), ci("requires"), ci("hotif"), ci("hotiftimeout"),
      ci("hotstring"), ci("include"), ci("includeagain"), ci("inputlevel"), ci("usehook"), ci("maxthreads")
    ))),

    // Matches anything (up to a newline)
    anything: $ => /.*/,

    _newline: $ => "\n"
  }
});

/**
 * Creates a case-insensitive regex pattern for a word
 * @param {string} word word - must be lowercase
 */
function ci(word) {
  return new RegExp(
    word
      .split('')
      .map(c => /[a-z]/i.test(c) ? `[${c.toLowerCase()}${c.toUpperCase()}]` : c)
      .join('')
  );
}