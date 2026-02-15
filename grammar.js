/**
 * @file Tree-sitter grammar for AHK v2
 * @author Tao Beloney
 * @license Unlicense
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

// Precedence levels (from lowest to highest)
// Based on https://www.autohotkey.com/docs/v2/Variables.htm#operators
const PREC = {
  COMMA: -20,                // Comma operator (lowest)
  FAT_ARROW_FUNCTION: -10,   // () => expr (not implemented)
  DEFAULT: 0,                // Just for readability
  ASSIGNMENT: 0,             // :=, +=, -=, etc.
  TERNARY: 10,               // ?:
  LOGICAL_OR: 20,            // ||, or
  LOGICAL_AND: 30,           // &&, and
  LOGICAL_NOT: 40,           // not (verbal NOT operator)
  CASE_INSENSITIVE: 50,      // is (type comparison)
  REGEX_MATCH: 60,           // ~= (regex match)
  INEQUALITY: 70,            // !=, !==
  EQUALITY: 80,              // =, ==
  RELATIONAL: 90,            // <, >, <=, >=
  CONCAT: 100,               // . (with spaces - a.b is member access, a . b is concatenation)
  BITWISE_OR: 110,           // |
  BITWISE_XOR: 120,          // ^
  BITWISE_AND: 130,          // &
  SHIFT: 140,                // <<, >>, >>>
  ADDITIVE: 150,             // +, -
  MULTIPLICATIVE: 160,       // *, /, //
  EXPONENT: 170,             // **
  PREFIX: 180,               // ++, --, unary +, -, !, ~, &
  POSTFIX: 190,              // ++, --
  MAYBE: 200,                // ? (not yet implemented))
  MEMBER_ACCESS: 210,        // a.b (not yet implemented)
  DEREFERENCE: 220,          // %expr%
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
    [$.param, $._primary_expression],
    // [$.byref_param, $.prefix_operation],
    // [$.variadic_param, $.multiplicative_operation],
    [$.variadic_param, $._primary_expression],
    [$.function_declaration, $._primary_expression],
    [$.function_declaration, $.variable_declaration],
    [$.object_literal, $.block],
  ],

  rules: {
    source_file: $ => repeat($._statement),

    _statement: $ => prec(2, choice(
      $.directive,
      $.function_declaration,
      $.single_expression,
      $.expression_sequence,
      $.block,
      $.return_statement,
      $.if_statement,
      $.while_statement,
      $.for_statement,
      $.loop_statement,
      $.switch_statement,
      $.try_statement,
      $.throw_statement,
      $.break_statement,
      $.continue_statement,
      $.goto_statement,
      $.label
    )),

    //#region General Expressions

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
      $.prefix_operation,
      $.postfix_operation,
      $.verbal_not_operation,
      $.fat_arrow_function,
      $.ternary_expression,
      $.dereference_operation,
      $.varref_operation
    ),

    expression_sequence: $ => prec.left(PREC.COMMA, seq(
      $.single_expression,
      repeat(seq(",", $.single_expression))
    )),

    // Helper for expressions without top-level parentheses (used in specialized loops)
    _non_paren_primary: $ => choice(
      $.literal,
      $.identifier,
      $._pairwise_operation
    ),

    _non_paren_expression: $ => choice(
      $._non_paren_primary,
      $.variable_declaration,
      $.assignment_operation,
      $.prefix_operation,
      $.postfix_operation,
      $.verbal_not_operation,
      $.fat_arrow_function,
      $.ternary_expression,
      $.dereference_operation,
      $.varref_operation
    ),

    // FIXME some declarations are contextually illegal - you can't delcare local variables in the auto-execute
    // section, for example. We may not be able to detect those with pure grammar rules
    variable_declaration: $ => seq(
      $.scope_identifier,
      $.identifier
    ),

    ternary_expression: $ => prec.right(PREC.TERNARY, seq(
      $.single_expression,
      "?",
      field("true_branch", $.single_expression),
      ":",
      field("false_branch", $.single_expression)
    )),

    //#endregion

    //#region Operators
    // TODO left-hand-side can be an accessor like outer.inner but scope identifier can't precede accessor
    // TODO rhs can be literal or statement - probably primary expression
    // TODO make these fields
    assignment_operation: $ => prec.right(PREC.ASSIGNMENT, seq(
      field("left", $.single_expression),
      $.assignment_operator,
      field("right", $.single_expression)
    )),

    dereference_operation: $ => prec(PREC.DEREFERENCE, seq(
      "%", $.single_expression, "%"
    )),

    varref_operation: $ => prec.right(PREC.PREFIX, seq(
      "&", $.single_expression
    )),

    // Any expression like left <op> right (e.g. 2 + 2, true != false)
    _pairwise_operation: $ => choice(
      $.additive_operation,
      $.multiplicative_operation,
      $.relational_operation,
      $.equality_operation,
      $.inequality_operation,
      $.regex_match_operation,
      $.type_check_operation,
      $.logical_and_operation,
      $.logical_or_operation,
      $.bitwise_and_operation,
      $.bitwise_xor_operation,
      $.bitwise_or_operation,
      $.bitshift_operation,
      $.explicit_concat_operation,
      $.exponent_operation
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

    type_check_operation: $ => prec.left(PREC.CASE_INSENSITIVE, seq(
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

    bitshift_operation: $ => prec.left(PREC.SHIFT, seq(
      field("left", $.single_expression),
      field("operator", $.bitshift_operator),
      field("right", $.single_expression)
    )),

    explicit_concat_operation: $ => prec.left(PREC.CONCAT, seq(
      field("left", $.single_expression),
      field("operator", " . "),   // !IMPORTANT: space is required to differentiate from member access
      field("right", $.single_expression)
    )),

    exponent_operation: $ => prec.left(PREC.EXPONENT, seq(
      field("left", $.single_expression),
      field("operator", "**"),
      field("right", $.single_expression)
    )),

    assignment_operator: $ => 
      choice( ":=", "+=", "-=", "*=", "/=", "//=", ".=", "|=", "&=", "^=", ">>=", "<<=", ">>>="),

    // "is must have whitespace, others are optional"
    comparison_operator: $ => choice(">", "<", ">=", "<=", "=", "==", "!=", "!==", "~=", ci(' is ')),

    unary_operator: $ => choice("~", "+", "-", "!"),

    math_operator: $ => choice("+", "-", "*", "/", "//"),

    bitwise_operator: $ => choice("&", "|", "^"),

    bitshift_operator: $ => choice("<<", ">>", ">>>"),

    arrow: $ => "=>",

    boolean_comparison_operator: $ => token(
      prec(PREC.KEYWORD, 
        choice("&&", ci('and'), "||", ci('or')
    ))),

    //#endregion

    //#region Functions
    fat_arrow_function: $ => prec(PREC.FAT_ARROW_FUNCTION, seq(
      // TODO this fails to match the wildcard (*) and variadic arguments (params*)
      $.function_head,
      $.arrow,
      field("body", $._primary_expression)
    )),

    // FIXME global functions cannot be static (can't be static to the auto-execute section)
    // but methods and nested functions (even nested inside global functions) can.
    // FIXME static is the only valid scope identifier for function declarations, but
    // using an alias makes tree-sitter fail to resolve the conflict between the 
    // $scope_identifier $identifier sequence
    function_declaration: $ => seq(
      optional($.scope_identifier),
      field("name", $.identifier),
      field("head", $.function_head),
      field("body", $.function_body)
    ),

    function_body: $ => choice(
      $.block,
      seq("=>", $.single_expression),
    ),

    function_head: $ => seq(
      "(", 
      optional(choice($.wildcard, $.param_sequence)), 
      ")"
    ),

    // "formal parameter list"
    param_sequence: $ => choice(
      // Just a variadic parameter: (params*)
      $.variadic_param,
      // One or more regular params, optionally followed by variadic: (a, b, rest*)
      seq(
        choice($.param, $.byref_param),
        repeat(seq(",", choice($.param, $.byref_param))),
        optional(seq(",", $.variadic_param))
      )
    ),

    param: $ => choice(
      $.identifier,
      seq(
        $.identifier,
        $._initializer
      ),
      seq($.identifier, $.optional_marker)
    ),

    _initializer: $ => seq(
      alias(":=", $.assignment_operator), 
      $.single_expression),

    optional_marker: $ => "?",

    byref_param: $ => seq("&", $.param),

    variadic_param: $ => seq($.identifier, $.wildcard),

    wildcard: $ => "*",

    //#endregion

    //#region Literals
    literal: $ => choice(
      $.numeric_literal,
      $.boolean_literal,
      $.string_literal,
      $.array_literal,
      $.object_literal,
      // Unset legality is contextual but where it is legal we should treat it as a literal
      $.unset
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

    array_literal: $ => seq("[", optional($.expression_sequence), "]"),

    object_literal: $ => seq("{", optional($.object_literal_member_sequence), "}"),

    object_literal_member_sequence: $ => seq(
      $.object_literal_member,
      repeat(seq(",", $.object_literal_member))
    ),

    object_literal_member: $ => seq($.identifier, ":", $.single_expression),

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

    //#region Control Flow

    block: $ => seq(
      "{", repeat($._statement), "}"
    ),

    if_statement: $ => prec.right(PREC.DEFAULT, seq(
      $.if,
      $.single_expression,
      choice($.block, $._statement),  // support brace-less forms
      repeat($.else_statement)
    )),

    else_statement: $ => prec.right(PREC.DEFAULT, seq(
      $.else,
      choice(
        seq($.if, $.single_expression, $.block),  // else if (condition) { ... }
        $.block                                     // else { ... }
      )
    )),

    loop_statement: $ => seq(
      $.loop,
      optional(choice(
        // Regular loop count - can be parenthesized
        prec(2, $.single_expression),
        // Specialized loops - no top-level parentheses allowed
        prec(1, seq($.parse, $._non_paren_expression, optional(seq(",", $._non_paren_expression)), optional(seq(",", $._non_paren_expression)))),
        prec(1, seq($.read, $._non_paren_expression, optional(seq(",", $._non_paren_expression)))),
        prec(1, seq($.files, $._non_paren_expression, optional(seq(",", $._non_paren_expression)))),
        prec(1, seq($.reg, $._non_paren_expression, optional(seq(",", $._non_paren_expression))))
      )),
      $.block
    ),

    until_statement: $ => seq($.until, $.single_expression),

    return_statement: $ => prec.right(PREC.DEFAULT,
      seq($.return, optional($.single_expression))),

    while_statement: $ => seq(
      $.while,
      $.single_expression,
      choice($.block, $._statement)  // support brace-less forms
    ),

    break_statement: $ => prec.right(seq(
      $.break,
      optional($.identifier)  // optional label target
    )),

    continue_statement: $ => prec.right(seq(
      $.continue,
      optional($.identifier)  // optional label target
    )),

    throw_statement: $ => seq(
      $.throw,
      $.single_expression
    ),

    goto_statement: $ => seq(
      $.goto,
      $.single_expression
    ),

    label: $ => prec(-1, seq(
      $.identifier,
      ":"
    )),

    for_statement: $ => prec.right(PREC.DEFAULT, seq(
      $.for,
      choice(
        // Parenthesized form: for (var in expr) or for (key, val in expr)
        seq("(", $._for_params, ")"),
        $._for_params
      ),
      choice($.block, $._statement),  // support brace-less forms
      // FIXME else if is not allowed here
      optional($.else_statement)
    )),

    _for_params: $ => choice(
      seq($.identifier, $.in, $.single_expression),
      seq($.identifier, ",", $.identifier, $.in, $.single_expression)
    ),

    try_statement: $ => prec.right(PREC.DEFAULT, seq(
      $.try,
      choice(
        seq(
          $.block,
          repeat($.catch_clause),
          //FIXME else if is not allowed here
          optional($.else_statement),
          optional($.finally_clause)
        ),
        // try x := 1 / 0
        $.single_expression
      )
    )),

    catch_clause: $ => seq(
      $.catch,
      optional(choice(
        seq("(", $._catch_params, ")"),
        $._catch_params
      )),
      $.block
    ),

    _catch_params: $ => seq(
      $.identifier,              // error type
      optional(seq($.as, $.identifier))    // as variable
    ),

    finally_clause: $ => seq(
      $.finally,
      $.block
    ),

    switch_statement: $ => seq(
      $.switch,
      $.single_expression,
      $.switch_body
    ),

    switch_body: $ => seq(
      "{",
      repeat(choice(
        $.case_clause,
        $.default_clause
      )),
      "}"
    ),

    case_clause: $ => seq(
      $.case,
      $.single_expression,
      repeat(seq(",", $.single_expression)),  // multiple values
      ":",
      repeat($._statement)
    ),

    default_clause: $ => seq(
      $.default,
      ":",
      repeat($._statement)
    ),

    // Control flow keywords
    if: $ => token(prec(PREC.KEYWORD, ci('if'))),
    else: $ => token(prec(PREC.KEYWORD, ci('else'))),
    while: $ => token(prec(PREC.KEYWORD, ci('while'))),
    for: $ => token(prec(PREC.KEYWORD, ci('for'))),
    in: $ => token(prec(PREC.KEYWORD, ci('in'))),
    loop: $ => token(prec(PREC.KEYWORD, ci('loop'))),
    until: $ => token(prec(PREC.KEYWORD, ci('until'))),
    try: $ => token(prec(PREC.KEYWORD, ci('try'))),
    catch: $ => token(prec(PREC.KEYWORD, ci('catch'))),
    finally: $ => token(prec(PREC.KEYWORD, ci('finally'))),
    return: $ => token(prec(PREC.KEYWORD, ci('return'))),
    throw: $ => token(prec(PREC.KEYWORD, ci('throw'))),
    goto: $ => token(prec(PREC.KEYWORD, ci('goto'))),
    break: $ => token(prec(PREC.KEYWORD, ci('break'))),
    continue: $ => token(prec(PREC.KEYWORD, ci('continue'))),
    as: $ => token(prec(PREC.KEYWORD, ci('as'))),
    switch: $ => token(prec(PREC.KEYWORD, ci('switch'))),
    case: $ => token(prec(PREC.KEYWORD, ci('case'))),
    default: $ => token(prec(PREC.KEYWORD, ci('default'))),
    parse: $ => token(prec(PREC.KEYWORD, ci('parse'))),
    read: $ => token(prec(PREC.KEYWORD, ci('read'))),
    files: $ => token(prec(PREC.KEYWORD, ci('files'))),
    reg: $ => token(prec(PREC.KEYWORD, ci('reg'))),

    //#endregion

    unset: $ => token(prec(PREC.KEYWORD, ci('unset'))),

    // Reserved keyword (not currently used as operator in v2, but reserved)
    _contains: $ => token(prec(PREC.KEYWORD, ci('contains'))),

    //#region Directives

    // Directives - we should match these to prevent errors, but for our purposes we don't actually
    // care about their contents, except for HotIf

    // #Include, #HotIf, etc
    directive: $ => seq("#", $.directive_identifier, $.anything),

    directive_identifier: $ => token(prec(PREC.KEYWORD, choice(
      ci("clipboardtimeout"), ci("dllload"), ci("errstdout"), ci("requires"), ci("hotif"), ci("hotiftimeout"),
      ci("hotstring"), ci("include"), ci("includeagain"), ci("inputlevel"), ci("usehook"), ci("maxthreads")
    ))),

    //#endregion

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