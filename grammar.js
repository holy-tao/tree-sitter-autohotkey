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
  COMMENT: -30,              // Must be lower than string literals, should be pretty low in general
  COMMA: -20,                // Comma operator (lowest)
  FAT_ARROW_FUNCTION: -10,   // () => expr
  DEFAULT: 0,                // Just for readability
  ASSIGNMENT: 0,             // :=, +=, -=, etc.
  TERNARY: 10,               // ?:
  OR_MAYBE: 20,              // var ?? default
  LOGICAL_OR: 30,            // ||, or
  LOGICAL_AND: 40,           // &&, and
  LOGICAL_NOT: 50,           // not (verbal NOT operator)
  CASE_INSENSITIVE: 60,      // is (type comparison)
  REGEX_MATCH: 70,           // ~= (regex match)
  INEQUALITY: 80,            // !=, !==
  EQUALITY: 90,              // =, ==
  RELATIONAL: 100,           // <, >, <=, >=
  CONCAT: 110,               // . (with spaces - a.b is member access, a . b is concatenation)
  BITWISE_OR: 120,           // |
  BITWISE_XOR: 130,          // ^
  BITWISE_AND: 140,          // &
  SHIFT: 150,                // <<, >>, >>>
  ADDITIVE: 160,             // +, -
  MULTIPLICATIVE: 170,       // *, /, //
  EXPONENT: 180,             // **
  PREFIX: 190,               // ++, --, unary +, -, !, ~, &
  POSTFIX: 200,              // ++, --
  MAYBE: 210,                // ?
  MEMBER_ACCESS: 220,        // a.b
  DEREFERENCE: 230,          // %expr%
  OVERRIDE: 500,             // item access, call access, etc. override other operator precedences
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

  word: $ => $.identifier,

  externals: $ => [
    $.optional_marker,
    $._function_def_marker,
    $.empty_arg,
    $._implicit_concat_marker,
    $._continuation_section_start,
    $._continuation_newline,
    $._directive_end,
    $.block_comment
  ],

  conflicts: $ => [
    [$._single_expression, $._param],
    [$._single_expression, $.default_param],
    [$._single_expression, $.variadic_param],
    [$._single_expression, $.dynamic_identifier],
    [$.dynamic_identifier],
    [$._single_expression, $._dynamic_identifier_chain],
    [$._dynamic_identifier_chain],
    [$.if_statement, $.else_statement],
  ],

  extras: $ => [
    /\s/,
    $.line_comment,
    $.block_comment
  ],

  rules: {
    source_file: $ => repeat($._top_level_statement),

    _top_level_statement: $ => choice(
      $._statement,
      $.hotstring,
      $.hotkey,
    ),

    _statement: $ => prec(2, choice(
      // Directives are allowed anywhere but executed unconditionally
      $._directive,
      $.function_declaration,
      $.class_declaration,
      $.call_statement,  // call_statements only at statement level
      $.expression_sequence,
      $._primary_expression,
      // blocks are allowed at the top level, though they don't do anything
      $.block,  
      $.label,
      $._control_flow_statement,
      $._loop_flow_statement
    )),

    // NOTE: this is actually more permissive than the AHK interpreter, which doesn't allow block comments inline
    // and requires a space before the ';' to start a line comment. For analysis purposes, this is fine. Feed your
    // script through /validate beforehand to check for overt syntax errors.
    // Precedence must be lower than string literals
    // TODO we could probably parse JSDoc comments and compiler directives like ;@ahk2exe-ignorebegin
    line_comment: $ => prec(PREC.COMMENT, token(/;[^\r\n]*/)),

    //#region General Expressions

    _control_flow_statement: $ => choice(
      $.return_statement,
      $.if_statement,
      $.while_statement,
      $.for_statement,
      $.loop_statement,
      $.switch_statement,
      $.try_statement,
      $.throw_statement,
      $.goto_statement
    ),

    _loop_flow_statement: $ => prec(2, choice(
      $.break_statement,
      $.continue_statement
    )),

    // "Expression statements" in the docs
    // https://www.autohotkey.com/docs/v2/Language.htm#expression-statements
    _primary_expression: $ => choice(
      $.assignment_operation,
      $.variable_declaration,
      $.ternary_expression,
      $.prefix_operation,
      $.postfix_operation,
      seq("(", $.expression_sequence, ")"),
      $.member_access,
      $.index_access,
      $.continuation_section,
      $.fat_arrow_function, // these are allowed, though unhelpful
      $.function_call       // Only parenthesized calls allowed in expressions
    ),

    _single_expression: $ => choice(
      $._pairwise_operation,
      $._literal,
      $.identifier,
      $.dynamic_identifier,
      $._primary_expression,
      $.verbal_not_operation,
      $.dereference_operation,
      $.varref_operation,
    ),

    expression_sequence: $ => prec.left(PREC.COMMA, seq(
      $._single_expression,
      repeat(seq(",", $._single_expression))
    )),

    // FIXME some declarations are contextually illegal - you can't delcare local variables in the auto-execute
    // section, for example. We may not be able to detect those with pure grammar rules
    variable_declaration: $ => seq(
      $.scope_identifier,
      $.identifier
    ),

    ternary_expression: $ => prec.right(PREC.TERNARY, seq(
      $._single_expression,
      "?",
      field("true_branch", $._single_expression),
      ":",
      field("false_branch", $._single_expression)
    )),

    //#endregion

    //#region Operators
    assignment_operation: $ => prec.left(PREC.ASSIGNMENT, seq(
      field("left", $._single_expression),
      $.assignment_operator,
      field("right", choice($._single_expression, $.optional_identifier))
    )),

    dereference_operation: $ => prec.left(PREC.DEREFERENCE, seq(
      "%", $._single_expression, "%"
    )),

    varref_operation: $ => prec.right(PREC.PREFIX + 5, seq(
      "&", $._single_expression
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
      $.implicit_concat_operation,
      $.exponent_operation,
      $.or_maybe_operation
    ),

    implicit_concat_operation: $ => prec.left(PREC.CONCAT, seq(
      field("left", $._single_expression),
      $._implicit_concat_marker,
      field("right", $._single_expression)
    )),

    // Postfix increment/decrement
    postfix_operation: $ => prec.left(PREC.POSTFIX, seq(
      field("operand", choice($.identifier, $.dynamic_identifier, $._primary_expression)),
      field("operator", choice(
        token.immediate("++"),
        token.immediate("--")
      ))
    )),

    // Prefix increment/decrement and high-precedence unary operators
    prefix_operation: $ => prec.right(PREC.PREFIX, seq(
      field("operator", choice(
        "++", "--",     // prefix increment/decrement
        "!", "~",       // logical NOT, bitwise NOT
        "+", "-"        // unary plus, unary minus
      )),
      field("operand", $._single_expression)
    )),

    // Verbal NOT operator (lower precedence than !)
    verbal_not_operation: $ => prec.right(PREC.LOGICAL_NOT, seq(
      field("operator", token(prec(PREC.KEYWORD, /not/i))),
      field("operand", $._single_expression)
    )),

    additive_operation: $ => prec.left(PREC.ADDITIVE, seq(
      field("left", $._single_expression),
      field("operator", choice("+", "-")),
      field("right", $._single_expression)
    )),

    multiplicative_operation: $ => prec.left(PREC.MULTIPLICATIVE, seq(
      field("left", $._single_expression),
      field("operator", choice("*", "/", "//")),
      field("right", $._single_expression)
    )),

    relational_operation: $ => prec.left(PREC.RELATIONAL, seq(
      field("left", $._single_expression),
      field("operator", choice("<", ">", "<=", ">=")),
      field("right", $._single_expression)
    )),

    equality_operation: $ => prec.left(PREC.EQUALITY, seq(
      field("left", $._single_expression),
      field("operator", choice("=", "==")),
      field("right", $._single_expression)
    )),

    inequality_operation: $ => prec.left(PREC.INEQUALITY, seq(
      field("left", $._single_expression),
      field("operator", choice("!=", "!==")),
      field("right", $._single_expression)
    )),

    regex_match_operation: $ => prec.left(PREC.REGEX_MATCH, seq(
      field("left", $._single_expression),
      field("operator", token(prec(200, "~="))),
      field("right", $._single_expression)
    )),

    type_check_operation: $ => prec.left(PREC.CASE_INSENSITIVE, seq(
      field("left", $._single_expression),
      field("operator", token(prec(PREC.KEYWORD, / is /i))),
      field("right", $._single_expression)
    )),

    logical_and_operation: $ => prec.left(PREC.LOGICAL_AND, seq(
      field("left", $._single_expression),
      field("operator", choice("&&", token(prec(PREC.KEYWORD, /and/i)))),
      field("right", $._single_expression)
    )),

    logical_or_operation: $ => prec.left(PREC.LOGICAL_OR, seq(
      field("left", $._single_expression),
      field("operator", choice("||", token(prec(PREC.KEYWORD, /or/i)))),
      field("right", $._single_expression)
    )),

    bitwise_and_operation: $ => prec.left(PREC.BITWISE_AND, seq(
      field("left", $._single_expression),
      field("operator", "&"),
      field("right", $._single_expression)
    )),

    bitwise_xor_operation: $ => prec.left(PREC.BITWISE_XOR, seq(
      field("left", $._single_expression),
      field("operator", "^"),
      field("right", $._single_expression)
    )),

    bitwise_or_operation: $ => prec.left(PREC.BITWISE_OR, seq(
      field("left", $._single_expression),
      field("operator", "|"),
      field("right", $._single_expression)
    )),

    bitshift_operation: $ => prec.left(PREC.SHIFT, seq(
      field("left", $._single_expression),
      field("operator", $.bitshift_operator),
      field("right", $._single_expression)
    )),

    explicit_concat_operation: $ => prec.left(PREC.CONCAT, seq(
      field("left", $._single_expression),
      // Turns out preceding whitespace is totally irrelevant for disambiguating member access from concatenation
      // `obj .prop` is member access, `obj . prop` is concatenation
      // Although `obj. prop` is a syntax error, and this parses it as concatenation
      field("operator", token(/\.\s+/)),
      field("right", $._single_expression)
    )),

    exponent_operation: $ => prec.right(PREC.EXPONENT, seq(
      field("left", $._single_expression),
      field("operator", "**"),
      field("right", $._single_expression)
    )),

    // "unset-coalescing"; the docs call this the or-maybe operator so I'm going with that
    or_maybe_operation: $ => prec.left(PREC.OR_MAYBE, seq(
      field("left", $._single_expression),
      field("operator", "??"),
      field("right", $._single_expression)
    )),

    member_access: $ => prec(PREC.MEMBER_ACCESS, seq(
      field("object", $._single_expression),
      ".",
      field("member", $.member_identifier)
    )),

    // Precedence should be lower than dynamic_identifier and _dynamic_identifier_chain so the chain in particular
    // can consume tokens greedily
    member_identifier: $ => prec(-1, choice(
      $.identifier,
      repeat1($.dereference_operation),
      $.dynamic_identifier,
    )),

    // A combination of identifiers and derefs, such as `a%b%`
    // Derefs can follow other derefs, like obj.%a%%b% - but the rules won't allow identifiers to follow other
    // identifiers; that's just a longer single identifier.
    // Adapted from: https://github.com/Descolada/keysharp/blob/master/Keysharp.Core/Scripting/Parser/Antlr/MainParser.g4#L480
    dynamic_identifier: $ => prec.left(choice(
      seq($.identifier, $._dynamic_identifier_chain),
      $._dynamic_identifier_chain
    )),

    _dynamic_identifier_chain: $ => prec.right(seq(
      repeat1($.dereference_operation), 
      optional($.identifier), 
      optional($._dynamic_identifier_chain)
    )),

    optional_identifier: $ => prec.right(PREC.MAYBE, seq($.identifier, $.optional_marker)),

    assignment_operator: $ => 
      choice( ":=", "+=", "-=", "*=", "/=", "//=", ".=", "|=", "&=", "^=", ">>=", "<<=", ">>>="),

    bitshift_operator: $ => choice("<<", ">>", ">>>"),

    arrow: $ => "=>",
    
    boolean_comparison_operator: $ => token(
      prec(PREC.KEYWORD, 
        choice("&&", /and/i, "||", /or/i
    ))),

    //#endregion

    //#region Function-like

    // Maybe "subscript access", the docs call it index access
    // See https://www.autohotkey.com/docs/v2/Variables.htm#square-brackets
    index_access: $ => prec(PREC.OVERRIDE, seq(
      field("object", $._single_expression),
      token.immediate("["),
      optional($.arg_sequence), 
      "]"
    )),

    // MsgBox("Hello", "Example", "IconI OK")
    // Can be used in expressions
    function_call: $ => prec(PREC.OVERRIDE, seq(
      field("function", $._single_expression),
      token.immediate("("),
      optional($.arg_sequence),
      ")"
    )),

    // MsgBox "Hello", "Example", "IconI OK"
    // Can only be used as a statement (not in expressions)
    call_statement: $ => prec.right(PREC.OVERRIDE, seq(
      // Only simple identifiers and object members for command-style
      field("function", choice(
        $.identifier, 
        $.member_access
      )),
      optional($.arg_sequence)
    )),

    _arg: $ => choice(
      $._single_expression,
      alias($.optional_identifier, $.optional_arg),
      $.empty_arg
    ),

    arg_sequence: $ => prec.right(choice(
      // Args without expansion
      seq(
        $._arg,
        repeat(seq(",", $._arg)),
        /**
         * A trailing comma is allowed but ignored - you can test this
         *    Function(params*) => MsgBox(params.length)
         *    Function(1,) ; "1"
         */
        optional(",")
      ),
      // Single arg with expansion
      seq(
        $._single_expression,
        $.array_expansion_marker
      ),
      // Multiple args with last one having expansion
      seq(
        $._arg,
        repeat(seq(",", $._arg)),
        ",",
        $._single_expression,
        $.array_expansion_marker
      )
    )),

    array_expansion_marker: $ => token.immediate("*"),

    //#region Function Declarations
    fat_arrow_function: $ => prec(PREC.FAT_ARROW_FUNCTION, seq(
      $.function_head,
      $.arrow,
      field("body", $._single_expression)
    )),

    // FIXME global functions cannot be static (can't be static to the auto-execute section)
    // but methods and nested functions (even nested inside global functions) can.
    // FIXME static is the only valid scope identifier for function declarations, but
    // using an alias makes tree-sitter fail to resolve the conflict between the 
    // $scope_identifier $identifier sequence
    function_declaration: $ => seq(
      $._function_def_marker,
      optional($.scope_identifier),
      field("name", $.identifier),
      field("head", $.function_head),
      field("body", $.function_body)
    ),

    function_body: $ => choice(
      $.block,
      seq("=>", $._single_expression),
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
      // One or more regular params, optionally followed by a variadic or wildcard: (a, b, rest*)
      seq(
        choice($._param, $.byref_param),
        repeat(seq(",", choice($._param, $.byref_param))),
        optional(choice(
          seq(",", $.variadic_param),
          seq(",", $.wildcard)
        ))
      )
    ),

    _param: $ => choice(
      $.identifier,
      alias($.optional_identifier, $.optional_param),
      $.default_param
    ),

    default_param: $ => seq($.identifier, $._initializer),
      
    _initializer: $ => seq(
      alias(":=", $.assignment_operator), 
      $._single_expression),

    byref_param: $ => seq("&", $._param),

    variadic_param: $ => seq($.identifier, $.wildcard),

    wildcard: $ => "*",

    //#endregion

    //#region Literals
    _literal: $ => choice(
      $._numeric_literal,
      $.boolean_literal,
      $.multiline_string_literal,
      $.string_literal,
      $.array_literal,
      $.object_literal,
      // Unset legality is contextual but where it is legal we should treat it as a literal
      $.unset
    ),

    _numeric_literal: $ => choice(
      $.integer_literal,      // ints
      $.float_literal,        // floats
      $.hex_literal,          // hex numbers
    ),

    integer_literal: $ => token(/([0-9]+)/),

    float_literal: $ => token(/[0-9]*\.[0-9]+/),

    hex_literal: $ => token(/0[xX][0-9a-fA-F]+/),

    boolean_literal: $ => token(
      prec(PREC.KEYWORD, choice(/true/i, /false/i))
    ),

    string_literal: $ => choice(
      token(/"([^"\r\n]|`[^\r\n\t])*"/),
      token(/'([^'\r\n]|`[^\r\n\t])*'/)
    ),

    array_literal: $ => seq("[", optional($.expression_sequence), "]"),

    object_literal: $ => seq("{", optional($.object_literal_member_sequence), "}"),

    object_literal_member_sequence: $ => seq(
      $.object_literal_member,
      repeat(seq(",", $.object_literal_member))
    ),

    object_literal_member: $ => seq(
      choice($.identifier, $.dynamic_identifier), 
      ":", 
      choice(
        $._single_expression, 
        $.optional_identifier
      )),

    //#endregion

    identifier: $ => /[a-zA-Z_][a-zA-Z0-9_]*/,

    // Note: not strictly "modifiers" because declaring one can switch a function into assume-local/global mode
    scope_identifier: $ => token(
      prec(PREC.KEYWORD, choice(
        /static/i,
        /local/i,
        /global/i
    ))),

    //#region Continuation Sections

    multiline_string_literal: $ => choice(
      $._double_quote_str_multiline,
      $._single_quote_str_multiline
    ),

    continuation_section: $ => seq(
      $._continuation_section_start,
      seq(
        // Comments always allowed because we can't filter for them in statements :(
        alias(repeat($._continuation_opt_any), $.continuation_option_sequence),
        $._continuation_newline,
        repeat($._statement)
      ),
      token(prec.left(1, ')'))
    ),
    
    _double_quote_str_multiline: $ => seq(
      '"',
      $._continuation_section_start,
      choice(
        seq(
          // With comments allowed
          alias($._continuation_opt_seq_comments, $.continuation_option_sequence),
          $._continuation_newline,
          optional(alias($._multiline_str_seq_comments, $.multiline_string_line_sequence))
        ),
        seq(
          // Comments not allowed
          alias(repeat($._continuation_opt_except_comments), $.continuation_option_sequence),
          $._continuation_newline,
          optional(alias($._multiline_str_seq_no_comments, $.multiline_string_line_sequence))
        )
      ),
      token(prec.left(1, ')"'))
    ),

    _single_quote_str_multiline: $ => seq(
      "'",
      $._continuation_section_start,
      choice(
        seq(
          // With comments allowed
          alias($._continuation_opt_seq_comments, $.continuation_option_sequence),
          $._continuation_newline,
          optional(alias($._multiline_str_seq_comments, $.multiline_string_line_sequence))
        ),
        seq(
          // Comments not allowed
          alias(repeat($._continuation_opt_except_comments), $.continuation_option_sequence),
          $._continuation_newline,
          optional(alias($._multiline_str_seq_no_comments, $.multiline_string_line_sequence))
        )
      ),
      token(prec.left(1, ")'"))
    ),

    _continuation_opt_seq_comments: $ => seq(
      repeat($._continuation_opt_except_comments),
      $.continuation_allow_comments,
      repeat($._continuation_opt_except_comments)
    ),

    _continuation_opt_any: $ => choice(
      $.continuation_join,
      $.continuation_ltrim,
      $.continuation_ltrim_off,
      $.continuation_rtrim_off,
      $.continuation_no_escape,
      $.continuation_allow_comments
    ),

    _continuation_opt_except_comments: $ => choice(
        $.continuation_join,
        $.continuation_ltrim,
        $.continuation_ltrim_off,
        $.continuation_rtrim_off,
        $.continuation_no_escape
    ),

    _multiline_str_seq_no_comments: $ => repeat1(
      seq(
        optional(alias($.anything, $.multiline_string_line)),
        $._continuation_newline
      )
    ),

    _multiline_str_seq_comments: $ => repeat1(
      seq(
        // Stop at ";", allow extras to create the comment
        // !BUG whitespace to the left of the comment is not trimmed - can result in extra nodes for comments on
        // !    lines without preceding text
        optional(alias(/[^\r\n;]+/, $.multiline_string_line)),
        $._continuation_newline
      )
    ),

    continuation_join: $ => token(prec(PREC.KEYWORD, /join[^\r\n\s]{0,15}/i)),

    continuation_ltrim: $ => token(prec(PREC.KEYWORD, /LTrim/i)),
    continuation_ltrim_off: $ => token(prec(PREC.KEYWORD, /LTrim0/i)),
    continuation_rtrim_off: $ => token(prec(PREC.KEYWORD, /RTrim0/i)),
    continuation_allow_comments: $ => token(prec(PREC.KEYWORD, /Comments|Comment|Com|C/i)),
    continuation_no_escape: $ => token(prec(PREC.KEYWORD, "`")),

    //#endregion

    //#region Control Flow

    // higher precedence than object_literal
    block: $ => prec(1, seq(
      "{", repeat($._statement), "}"
    )),

    if_statement: $ => prec.right(PREC.DEFAULT, seq(
      $.if,
      $._single_expression,
      choice($.block, $._statement),  // support brace-less forms
      repeat($.else_statement)
    )),

    else_statement: $ => prec.right(PREC.DEFAULT, seq(
      $.else,
      choice(
        seq($.if, $._single_expression, choice($.block, $._statement)),  // else if (condition) ... (with or without braces)
        choice($.block, $._statement)                                    // else ... (with or without braces)
      )
    )),

    loop_statement: $ => prec.right(seq(
      $.loop,
      optional(field("head", choice(
        choice(
          seq(token("("), $._single_expression, token(")")),
          $._single_expression
        ),
        choice(
          // Specialized loops - no top-level parentheses allowed
          prec(1, seq($.parse, $._single_expression, optional(seq(",", $._single_expression)), optional(seq(",", $._single_expression)))),
          prec(1, seq($.read, $._single_expression, optional(seq(",", $._single_expression)))),
          prec(1, seq($.files, $._single_expression, optional(seq(",", $._single_expression)))),
          prec(1, seq($.reg, $._single_expression, optional(seq(",", $._single_expression))))
        )
      ))),
      field("body", $._statement),
      optional($.until_statement)
    )),

    until_statement: $ => seq($.until, $._single_expression),

    return_statement: $ => prec.right(PREC.DEFAULT,
      seq($.return, optional($._single_expression))),

    while_statement: $ => seq(
      $.while,
      choice(
        seq(token("("), $._single_expression, token(")")),
        $._single_expression
      ),
      field("body", $._statement),
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
      $._single_expression
    ),

    goto_statement: $ => seq(
      $.goto,
      $._single_expression
    ),

    label: $ => prec(1, seq(
      $.identifier,
      token.immediate(":")
    )),

    for_statement: $ => prec.right(PREC.DEFAULT, seq(
      $.for,
      field("head", choice(
        // Parenthesized form: for (var in expr) or for (key, val in expr)
        seq("(", $._for_params, ")"),
        $._for_params
      )),
      field("body", $._statement),
      optional($.else_statement)
    )),

    _for_params: $ => choice(
      seq($.identifier, $.in, $._single_expression),
      seq($.identifier, ",", $.identifier, $.in, $._single_expression)
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
        $._single_expression
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
      field("head", $._single_expression),
      field("body", $.switch_body)
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
      $._single_expression,
      repeat(seq(",", $._single_expression)),  // multiple values
      ":",
      repeat($._statement)
    ),

    default_clause: $ => seq(
      $.default,
      ":",
      repeat($._statement)
    ),

    // Control flow keywords
    if: $ => token(prec(PREC.KEYWORD, /if/i)),
    else: $ => token(prec(PREC.KEYWORD, /else/i)),
    while: $ => token(prec(PREC.KEYWORD, /while/i)),
    for: $ => token(prec(PREC.KEYWORD, /for/i)),
    in: $ => token(prec(PREC.KEYWORD, /in/i)),
    loop: $ => token(prec(PREC.KEYWORD, /loop/i)),
    until: $ => token(prec(PREC.KEYWORD, /until/i)),
    try: $ => token(prec(PREC.KEYWORD, /try/i)),
    catch: $ => token(prec(PREC.KEYWORD, /catch/i)),
    finally: $ => token(prec(PREC.KEYWORD, /finally/i)),
    return: $ => token(prec(PREC.KEYWORD, /return/i)),
    throw: $ => token(prec(PREC.KEYWORD, /throw/i)),
    goto: $ => token(prec(PREC.KEYWORD, /goto/i)),
    break: $ => token(prec(PREC.KEYWORD, /break/i)),
    continue: $ => token(prec(PREC.KEYWORD, /continue/i)),
    as: $ => token(prec(PREC.KEYWORD, /as/i)),
    switch: $ => token(prec(PREC.KEYWORD, /switch/i)),
    case: $ => token(prec(PREC.KEYWORD, /case/i)),
    default: $ => token(prec(PREC.KEYWORD, /default/i)),
    parse: $ => token(prec(PREC.KEYWORD, /parse/i)),
    read: $ => token(prec(PREC.KEYWORD, /read/i)),
    files: $ => token(prec(PREC.KEYWORD, /files/i)),
    reg: $ => token(prec(PREC.KEYWORD, /reg/i)),

    //#endregion

    //#region Classes

    class_declaration: $ => seq(
      $.class,
      field("name", $.identifier),
      optional(seq(
        $.extends,
        field("superclass", choice($.identifier, $.member_access))
      )),
      $.class_body
    ),

    class_body: $ => seq(
      "{",
      repeat(choice(
        alias($.function_declaration, $.method_declaration),
        $.class_declaration,
        $.property_declaration
      )),
      "}"
    ),

    property_declaration: $ => seq(
      //FIXME global and static aren't valid scope identifiers here
      optional($.scope_identifier),
      $.identifier,
      optional(seq("[", $.param_sequence, "]")),
      choice(
        // Property initializer: prop := value
        $._initializer,
        // getter-only shorthand: prop => 42
        seq("=>", alias($._single_expression, $.getter)),
        $.property_declaration_block
      )
    ),

    //Interestingly, property bodies are allowed to be empty, the interpreter just skips them
    property_declaration_block: $ => seq(
      "{",
      optional($.getter),
      optional($.setter),
      "}"
    ),

    getter: $ => seq($.get, $.function_body),
    setter: $ => seq($.set, $.function_body),

    // class-related keywords
    class: $ => token(prec(PREC.KEYWORD, /class/i)),
    extends: $ => token(prec(PREC.KEYWORD, /extends/i)),
    get: $ => token(prec(PREC.KEYWORD, /get/i)),
    set: $ => token(prec(PREC.KEYWORD, /set/i)),
    static: $ => token(prec(PREC.KEYWORD, /static/i)),

    //#endregion

    unset: $ => token(prec(PREC.KEYWORD, /unset/i)),

    // Reserved keyword (not currently used as operator in v2, but reserved)
    _contains: $ => token(prec(PREC.KEYWORD, /contains/i)),

    //#region Directives

    // Directives - we should match these to prevent errors, but for our purposes we don't actually
    // care about their contents, except for HotIf

    // #Include, #HotIf, etc
    _directive: $ => choice(
      $.clipboard_timeout_directive,
      $.dll_load_directive,
      $.error_stdout_directive,
      $.requires_directive,
      $.hotif_directive,
      $.hotif_timeout_directive,
      $.hotstring_directive,
      $.include_directive,
      $.include_again_directive,
      $.input_level_directive,
      $.use_hook_directive,
      $.max_threads_directive,
      $.max_threads_per_hotkey_directive,
      $.max_threads_buffer_directive,
      $.no_tray_icon_directive,
      $.single_instance_directive,
      $.warn_directive,
    ),

    clipboard_timeout_directive: $ => seq(token(prec(PREC.KEYWORD, /#ClipboardTimeout/i)), $.integer_literal),

    dll_load_directive: $ => seq(
      kwtok(/#DllLoad/i),
      optional($.file_or_dir_name),
      $._directive_end
    ),

    // https://www.autohotkey.com/docs/v2/lib/FileEncoding.htm
    error_stdout_directive: $ => seq(
      kwtok(/#ErrorStdOut/i),
      optional(alias(kwtok(/['"]?(utf-8(-raw)?|utf-16(-raw)?|cp\d+|\d+)['"]?/i), $.encoding_identifier)),
      $._directive_end
    ),

    requires_directive: $ => prec.right(seq(
      kwtok(/#Requires/i),
      kwtok(/AutoHotkey/i),
      repeat($.version_requirement),
      optional($.bitness),
      $._directive_end
    )),

    hotif_directive: $ => prec.right(seq(
      kwtok(/#Hotif/i),
      optional(field("expression", $._single_expression)),
      $._directive_end
    )),

    hotif_timeout_directive: $ => seq(
      kwtok(/#HotifTimeout/i),
      $.integer_literal,
      $._directive_end
    ),

    hotstring_directive: $ => seq(
      kwtok(/#Hotstring/i),
      choice(
        alias(kwtok(/NoMouse/i), $.hotstring_no_mouse),
        seq(
          kwtok(/EndChars/i),
          alias(token(/[^\s]{1,100}/), $.hotstring_end_chars)
        ),
        alias(repeat1(choice($._hotstring_modifier, $.hotstring_execute)), $.hotstring_option_sequence)
      ),
      $._directive_end
    ),

    include_directive: $ => prec.left(seq(
      kwtok(/#Include/i),
      optional($.include_ignore_failure),
      choice(
        $.file_or_dir_name,
        $.lib_name
      ),
      $._directive_end
    )),

    include_again_directive: $ => prec.left(seq(
      kwtok(/#IncludeAgain/i),
      optional($.include_ignore_failure),
      choice(
        $.file_or_dir_name,
        $.lib_name
      ),
      $._directive_end
    )),

    input_level_directive: $ => seq(
      kwtok(/#InputLevel/i),
      $.integer_literal,
      $._directive_end
    ),

    use_hook_directive: $ => seq(
      kwtok(/#UseHook/i),
      choice(
        $.boolean_literal, 
        alias(choice(token("0"), token("1")), $.integer_literal)
      ),
      $._directive_end,
    ),

    max_threads_directive: $ => seq(
      kwtok(/#MaxThreads/i),
      $.integer_literal,
      $._directive_end
    ),

    max_threads_per_hotkey_directive: $ => seq(
      kwtok(/#MaxThreadsPerHotkey/i),
      $.integer_literal,
      $._directive_end
    ),

    max_threads_buffer_directive: $ => seq(
      kwtok(/#MaxThreadsBuffer/i),
      optional(choice(
        $.boolean_literal, 
        alias(choice(token("0"), token("1")), $.integer_literal)
      )),
      $._directive_end
    ),

    no_tray_icon_directive: $ => seq(
      kwtok(/#NoTrayIcon/i),
      $._directive_end
    ),

    single_instance_directive: $ => seq(
      kwtok(/#SingleInstance/i),
      optional(alias(kwtok(/Force|Ignore|Prompt|Off/i), $.single_instance_mode)),
      $._directive_end
    ),

    warn_directive: $ => seq(
      kwtok(/#Warn/i),
      optional(seq(
        $.warning_type,
        optional(seq(",", $.warning_mode))
      )),
      $._directive_end
    ),

    warning_type: $ => kwtok(/VarUnset|LocalSameAsGlobal|Unreachable|All/i),
    warning_mode: $ => kwtok(/MsgBox|StdOut|OutputDebug|Off/i),
    version_requirement: $ => kwtok(/(|<=|>=|>|<)?[vV]?[^\r\n\t ]+[\+]?/i),

    include_ignore_failure: $ => token(prec.right(PREC.KEYWORD, "*i")),
    file_or_dir_name: $ => token(prec.right(PREC.KEYWORD, /['"]?[^\r\n\s<>\*\?"]+[^\r\n<>\*\?"]*[^\r\n<>\*\?"]*['"]?/i)),
    lib_name: $ => token(prec.right(PREC.KEYWORD, /['"]?<[^\r\n\s<>\*\?"]+[^\r\n<>\*\?"]*[^\r\n<>\*\?"]*>['"]?/i)),

    bitness: $ => token(prec(PREC.KEYWORD + 1, /32-bit|64-bit/i)),

    //#endregion

    //#region Hotstrings
    // See: https://www.autohotkey.com/docs/v2/Hotstrings.htm
    // See also KeySharp's ANTLR grammmar: https://github.com/Descolada/keysharp/blob/master/Keysharp.Core/Scripting/Parser/Antlr/MainLexer.g4#L60
    hotstring: $ => choice(
      $._replacement_hotstring,
      $._exec_hotstring
    ),

    _replacement_hotstring: $ => prec.right(seq(
        ":",
        field("modifiers", alias(repeat($._hotstring_modifier), $.hotstring_option_sequence)),
        token.immediate(":"),
        field("trigger", $.hotstring_trigger),
        $._double_colon,
        optional(choice(
          // blocks and function declarations are allowed, but calls can't be on the same line
          $.block,
          $.function_declaration,
          $.hotstring_replacement,
        ))
    )),

    _exec_hotstring: $ => prec.right(seq(
        ":",
        field("modifiers", alias($._hotstring_opt_seq_exec, $.hotstring_option_sequence)),
        token.immediate(":"),
        field("trigger", $.hotstring_trigger),
        $._double_colon,
        optional(choice(
          // Can't have literal replacements, can have statements on the same line
          $.block,
          $._single_expression,
          repeat1($._statement)
        ))
    )),

    _double_colon: $ => token("::"),

    // Used in hotstrings - can match any non-whitespace, non-colon characters
    hotstring_trigger: $ => token(/[^\s:]+/),

    hotstring_replacement: $ => token.immediate(/[^\n]+/),  // Rest of line as text replacement (one or more, excludes newline)

    _hotstring_opt_seq_no_exec: $ => repeat($._hotstring_modifier),
    _hotstring_opt_seq_exec: $ => seq(
      repeat($._hotstring_modifier),
      $.hotstring_execute,
      repeat($._hotstring_modifier)
    ),

    _hotstring_modifier: $ => choice(
      $.hotstring_asterisk,
      $.hotstring_question,
      $.hotstring_backspace,
      $.hotstring_case_sensitive,
      $.hotstring_case_conform,
      $.hotstring_key_delay,
      $.hotstring_omit_ending,
      $.hotstring_priority,
      $.hotstring_raw,
      $.hotstring_suspend,
      $.hotstring_send_mode,
      $.hotstring_text_mode,
      $.hotstring_reset
      // hotstring_space handled separately as its own hotstring pattern
    ),

    // Boolean-style options with optional '0' suffix
    hotstring_asterisk: $ => token(seq('*', optional('0'))),
    hotstring_question: $ => token(seq('?', optional('0'))),
    hotstring_backspace: $ => token(seq(/b/i, optional('0'))),
    hotstring_case_sensitive: $ => token(seq(/c/i, optional('0'))),
    hotstring_omit_ending: $ => token(seq(/o/i, optional('0'))),
    hotstring_raw: $ => token(seq(/r/i, optional('0'))),
    hotstring_suspend: $ => token(seq(/s/i, optional('0'))),
    hotstring_text_mode: $ => token(seq(/t/i, optional('0'))),
    hotstring_reset: $ => token(seq(/z/i, optional('0'))),

    // Options without '0' suffix
    hotstring_execute: $ => token(/x/i),
    hotstring_case_conform: $ => token(seq(/c/i, '1')),  // C1 only
    hotstring_space: $ => token(prec(-10, ' ')),  // Very low precedence to avoid conflicts

    // Send mode options (mutually exclusive but grammar accepts all)
    hotstring_send_mode: $ => token(choice(
      /si/i,
      /sp/i,
      /se/i,
    )),

    // Parameterized options with numeric arguments
    // Kn - key delay (can be negative with optional spaces)
    hotstring_key_delay: $ => token(seq(
      /[kK]/,
      optional(repeat(/[ \t]/)),
      optional('-'),
      optional(repeat(/[ \t]/)),
      /[0-9]+/
    )),

    // Pn - thread priority
    hotstring_priority: $ => token(/[pP][0-9]+/),

    //#endregion

    //#region Hotkeys
    // See https://www.autohotkey.com/docs/v2/Hotkeys.htm

    // Higher precedence than label to ensure :: is recognized before :
    // Using identifier here allows tree-sitter to resolve conflicts automatically
    hotkey: $ => prec.right(3, seq(
      field("trigger", $.hotkey_trigger),
      token.immediate("::"),
      optional(choice(
        $._single_expression,
        $.function_declaration,
        $.block,
        $._hotkey_alttabcommand,
        $.call_statement
      ))
    )),

    hotkey_trigger: $ => prec.right(PREC.KEYWORD, seq(
      seq(
        repeat($._hotkey_modifier),
        $._hotkey_trigger_char_sequence,
        optional($.hotkey_up)
      ),
      optional(repeat(seq(
        $.hotkey_and,
        $.hotkey_trigger
      )))
    )),

    // hotkey modifiers
    _hotkey_modifier: $ => choice(
      $.hotkey_nonblocking,
      $.hotkey_usehook,
    ),

    _hotkey_trigger_char_sequence: $ => repeat1(choice(
      // Special characters for "modifier" keys
      $.hotkey_win,
      $.hotkey_alt,
      $.hotkey_ctrl,
      $.hotkey_shift,
      $.hotkey_left,
      $.hotkey_right,
      $.identifier
    )),

    hotkey_win: $ => token('#'),
    hotkey_alt: $ => token('!'),
    hotkey_ctrl: $ => token('^'),
    hotkey_shift: $ => token('+'),
    // Requires space - match before "&" operator
    hotkey_and: $ => token.immediate(' & '),
    hotkey_left: $ => token('<'),
    hotkey_right: $ => token('>'),
    // Match before bitwise NOT operator ("~")
    hotkey_nonblocking: $ => token(prec.right(PREC.PREFIX, '~')),
    hotkey_usehook: $ => token('$'),
    // Requires preceding space
    hotkey_up: $ => token.immediate(prec(PREC.KEYWORD, / [uU][pP]/)),

    // These are only valid as hotkey operations and must immediately follow the double-colon
    //See: https://www.autohotkey.com/docs/v2/Hotkeys.htm#alttab
    _hotkey_alttabcommand: $ => choice(
        $.hotkey_alttab,
        $.hotkey_shiftalttab,
        $.hotkey_alttabmenu,
        $.hotkey_alttabandmenu,
        $.hotkey_alttabmenudismiss
    ),

    hotkey_alttab: $ => token.immediate(prec(PREC.KEYWORD, /AltTab/i)),
    hotkey_shiftalttab: $ => token.immediate(prec(PREC.KEYWORD, /ShiftAltTab/i)),
    hotkey_alttabmenu: $ => token.immediate(prec(PREC.KEYWORD, /AltTabMenu/i)),
    hotkey_alttabandmenu: $ => token.immediate(prec(PREC.KEYWORD, /AltTabAndMenu/i)),
    hotkey_alttabmenudismiss: $ => token.immediate(prec(PREC.KEYWORD, /AltTabMenuDismiss/i)),

    //#endregion

    // Matches anything (up to a newline)
    anything: $ => /[^\r\n]*/,

    _newline: $ => "\n"
  }
});

/**
 * @param {RuleOrLiteral} pattern
 */
function kwtok(pattern) {
  return token(prec(PREC.KEYWORD, pattern));
}