/**
 * @file Tree-sitter grammar for AHK v2
 * @author Tao Beloney
 * @license Unlicense
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check


// precedence constants - default when unset is 0, higher number = higher precedence.
// Based on https://www.autohotkey.com/docs/v2/Variables.htm#operators

// Precedence levels (from lowest to highest)
const PREC = {
  COMMA: -20,                // Comma operator (lowest)
  FAT_ARROW_FUNCTION : -10,  // () => expr (not implemented)
  ASSIGNMENT: 0,             // :=, +=, -=, etc.
  TERNARY: 10,               // ?: (not yet implemented)
  LOGICAL_OR: 20,            // ||, or
  LOGICAL_AND: 30,           // &&, and
  LOGICAL_NOT: 40,           // not (verbal NOT operator)
  CASE_INSENSITIVE: 50,      // is (type comparison)
  REGEX_MATCH: 60,           // ~= (regex match)
  INEQUALITY: 70,            // !=, !==
  EQUALITY: 80,              // =, ==
  RELATIONAL: 90,            // <, >, <=, >=
  CONCAT: 100,               // . (explicit string concatenation, not implemented)
  BITWISE_OR: 110,           // |
  BITWISE_XOR: 120,          // ^
  BITWISE_AND: 130,          // &
  SHIFT: 140,                // <<, >>, >>> (not yet implemented)
  ADDITIVE: 150,             // +, -
  MULTIPLICATIVE: 160,       // *, /, //
  EXPONENT: 170,             // ** (not yet implemented)
  PREFIX: 180,               // ++, --, unary +, -, !, ~, &
  POSTFIX: 190,              // ++, --
  MAYBE: 200,                // ? (not yet implemented))
  MEMBER_ACCESS: 210,        // a.b (not yet implemented)
  DEREFERENCE: 220,          // %expr% (not yet implemented)
  KEYWORD: 9999,             // Keywords should match before other identifiers
};

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
      prec(3, seq("(", $.expression_sequence, ")")),
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
      $.verbal_not_operation,
    ),

    expression_sequence: $ => prec.left(PREC.COMMA, seq(
      $.single_expression,
      repeat(seq(",", $.single_expression))
    )),

    // FIXME some declarations are contextually illegal - you can't delcare local variables in the auto-execute
    // section, for example. We may not be able to detect those with pure grammar rules
    variable_declaration: $ => seq(
      $.scope_identifier,
      $.identifier
    ),

    //#region Operators
    // TODO left-hand-side can be an accessor like outer.inner but scope identifier can't precede accessor
    // TODO rhs can be literal or statement - probably primary expression
    // TODO make these fields
    assignment_operation: $ => prec.right(PREC.ASSIGNMENT, seq(
      field("left", $.single_expression),
      $.assignment_operator,
      field("right", $.single_expression)
    )),

    // Any expression like left <op> right (e.g. 2 + 2, true != false)
    _pairwise_operation: $ => choice(
      $.additive_operation,
      $.multiplicative_operation,
      $.relational_operation,
      $.equality_operation,
      $.inequality_operation,
      $.regex_match_operation,
      $.case_insensitive_operation,
      $.logical_and_operation,
      $.logical_or_operation,
      $.bitwise_and_operation,
      $.bitwise_xor_operation,
      $.bitwise_or_operation
    ),

    // Postfix increment/decrement
    postfix_operation: $ => prec.left(PREC.POSTFIX, seq(
      field("operand", $._primary_expression),
      field("operator", choice("++", "--"))
    )),

    // Prefix increment/decrement and high-precedence unary operators
    prefix_operation: $ => prec.right(PREC.PREFIX, seq(
      field("operator", choice(
        "++", "--",     // prefix increment/decrement
        "!", "~",       // logical NOT, bitwise NOT
        "+", "-"        // unary plus, unary minus
      )),
      field("operand", choice($._primary_expression, $.postfix_operation))
    )),

    // Verbal NOT operator (lower precedence than !)
    verbal_not_operation: $ => prec.right(PREC.LOGICAL_NOT, seq(
      field("operator", token(prec(PREC.KEYWORD, ci('not')))),
      field("operand", $.single_expression)
    )),

    additive_operation: $ => prec.left(PREC.ADDITIVE, seq(
      field("left", $.single_expression),
      field("operator", choice("+", "-")),
      field("right", $.single_expression)
    )),

    multiplicative_operation: $ => prec.left(PREC.MULTIPLICATIVE, seq(
      field("left", $.single_expression),
      field("operator", choice("*", "/", "//")),
      field("right", $.single_expression)
    )),

    relational_operation: $ => prec.left(PREC.RELATIONAL, seq(
      field("left", $.single_expression),
      field("operator", choice("<", ">", "<=", ">=")),
      field("right", $.single_expression)
    )),

    equality_operation: $ => prec.left(PREC.EQUALITY, seq(
      field("left", $.single_expression),
      field("operator", choice("=", "==")),
      field("right", $.single_expression)
    )),

    inequality_operation: $ => prec.left(PREC.INEQUALITY, seq(
      field("left", $.single_expression),
      field("operator", choice("!=", "!==")),
      field("right", $.single_expression)
    )),

    regex_match_operation: $ => prec.left(PREC.REGEX_MATCH, seq(
      field("left", $.single_expression),
      field("operator", "~="),
      field("right", $.single_expression)
    )),

    case_insensitive_operation: $ => prec.left(PREC.CASE_INSENSITIVE, seq(
      field("left", $.single_expression),
      field("operator", token(prec(PREC.KEYWORD, ci(' is ')))),
      field("right", $.single_expression)
    )),

    logical_and_operation: $ => prec.left(PREC.LOGICAL_AND, seq(
      field("left", $.single_expression),
      field("operator", choice("&&", token(prec(PREC.KEYWORD, ci('and'))))),
      field("right", $.single_expression)
    )),

    logical_or_operation: $ => prec.left(PREC.LOGICAL_OR, seq(
      field("left", $.single_expression),
      field("operator", choice("||", token(prec(PREC.KEYWORD, ci('or'))))),
      field("right", $.single_expression)
    )),

    bitwise_and_operation: $ => prec.left(PREC.BITWISE_AND, seq(
      field("left", $.single_expression),
      field("operator", "&"),
      field("right", $.single_expression)
    )),

    bitwise_xor_operation: $ => prec.left(PREC.BITWISE_XOR, seq(
      field("left", $.single_expression),
      field("operator", "^"),
      field("right", $.single_expression)
    )),

    bitwise_or_operation: $ => prec.left(PREC.BITWISE_OR, seq(
      field("left", $.single_expression),
      field("operator", "|"),
      field("right", $.single_expression)
    )),

    assignment_operator: $ => 
      choice( ":=", "+=", "-=", "*=", "/=", "//=", ".=", "|=", "&=", "^=", ">>=", "<<=", ">>>="),

    // "is must have whitespace, others are optional"
    comparison_operator: $ => choice(">", "<", ">=", "<=", "=", "==", "!=", "!==", "~=", ci(' is ')),

    unary_operator: $ => choice("~", "+", "-", "!"),

    math_operator: $ => choice("+", "-", "*", "/", "//"),

    bitwise_operator: $ => choice("&", "|", "^"),

    boolean_comparison_operator: $ => token(
      prec(PREC.KEYWORD, 
        choice("&&", ci('and'), "||", ci('or')
    ))),

    //#endregion

    //#region Literals
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
      prec(PREC.KEYWORD, choice(ci('true'), ci('false')))
    ),

    // TODO multiline string literals - https://www.autohotkey.com/docs/v2/Scripts.htm#continuation
    string_literal: $ => choice(
      seq('"', repeat($._double_quote_str_char), '"'),
      seq("'", repeat($._single_quote_str_char), "'")
    ),

    //#endregion

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,

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
      prec(PREC.KEYWORD, choice(
        ci('static'),
        ci('local'),
        ci('global')
    ))),

    // Control flow keywords
    _if: $ => token(prec(PREC.KEYWORD, ci('if'))),
    _else: $ => token(prec(PREC.KEYWORD, ci('else'))),
    _while: $ => token(prec(PREC.KEYWORD, ci('while'))),
    _for: $ => token(prec(PREC.KEYWORD, ci('for'))),
    _in: $ => token(prec(PREC.KEYWORD, ci('in'))),
    _loop: $ => token(prec(PREC.KEYWORD, ci('loop'))),
    _until: $ => token(prec(PREC.KEYWORD, ci('until'))),

    unset: $ => token(prec(PREC.KEYWORD, ci('unset'))),

    // Reserved keyword (not currently used as operator in v2, but reserved)
    _contains: $ => token(prec(PREC.KEYWORD, ci('contains'))),

    // Directives - we should match these to prevent errors, but for our purposes we don't actually
    // care about their contents, except for HotIf

    // #Include, #HotIf, etc
    directive: $ => seq("#", $.directive_identifier, $.anything),

    directive_identifier: $ => token(prec(PREC.KEYWORD, choice(
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