#include "tree_sitter/parser.h"
#include <ctype.h>
#include <string.h>

// This external scanner currently handles lookaheads for:
//  1.  Optional markers ("?") to differentiate them from ternary expressions
//  2.  Function declarations
//  3.  Array expansion markers ("*") to differentiate them from multiplication

// tree-sitter characters are of type int32_t, <ctypes> expects chars, so we roll our own macros

#define is_alpha(c) ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))
#define is_digit(c) ((c) >= '0' && (c) <= '9')
#define is_xdigit(c) (is_digit(c) || ((c) >= 'a' && (c) <= 'f') || ((c) >= 'A' && (c) <= 'F'))
#define is_alnum(c) (is_alpha(c) || is_digit(c))
#define is_identifier_char(c) (is_alnum(c) || (c == '_'))
#define is_eol(c) (c == '\r' || c == '\n' || c == '\0')
#define is_whitespace(c) (c == ' ' || c == '\t' || c == '\n' || c == '\r')

#define STRCASEEQ_ANY_1(s, a)          strcaseeq(s, a)
#define STRCASEEQ_ANY_2(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_1(s, __VA_ARGS__)
#define STRCASEEQ_ANY_3(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_2(s, __VA_ARGS__)
#define STRCASEEQ_ANY_4(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_3(s, __VA_ARGS__)
#define STRCASEEQ_ANY_5(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_4(s, __VA_ARGS__)
#define STRCASEEQ_ANY_6(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_5(s, __VA_ARGS__)
#define STRCASEEQ_ANY_7(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_6(s, __VA_ARGS__)
#define STRCASEEQ_ANY_8(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_7(s, __VA_ARGS__)
#define STRCASEEQ_ANY_9(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_8(s, __VA_ARGS__)
#define STRCASEEQ_ANY_10(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_9(s, __VA_ARGS__)
#define STRCASEEQ_ANY_11(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_10(s, __VA_ARGS__)
#define STRCASEEQ_ANY_12(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_11(s, __VA_ARGS__)
#define STRCASEEQ_ANY_13(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_12(s, __VA_ARGS__)
#define STRCASEEQ_ANY_14(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_13(s, __VA_ARGS__)
#define STRCASEEQ_ANY_15(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_14(s, __VA_ARGS__)
#define STRCASEEQ_ANY_16(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_15(s, __VA_ARGS__)
#define STRCASEEQ_ANY_17(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_16(s, __VA_ARGS__)
#define STRCASEEQ_ANY_18(s, a, ...)     strcaseeq(s, a) || STRCASEEQ_ANY_17(s, __VA_ARGS__)

#define _STRCASEEQ_ANY_N(_1,_2,_3,_4,_5,_6,_7,_8,_9,_10,_11,_12,_13,_14,_15,_16,_17,_18,N,...) STRCASEEQ_ANY_##N
/// Performs a case-insensitive comparison of `s` against up to 12 character arrays, returns true if any match
#define strcaseeq_any(s, ...) \
    (_STRCASEEQ_ANY_N(__VA_ARGS__, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1)(s, __VA_ARGS__))

/// Skips all whitespace, including newlines
#define skip_whitespace(lexer)  while (is_whitespace(lexer->lookahead)) { \
                                  lexer->advance(lexer, true);            \
                                }

// Skip characters until we hit a whitespace character or eof
#define skip_to_whitespace(lexer) while(!is_whitespace(lexer->lookahead) && !is_eof(lexer)) {     \
                                    lexer->advance(lexer, false);                                 \
                                  }

#define skip_eol(lexer) while(is_eol(lexer->lookahead)) { lexer->advance(lexer, true); }

#define is_eof(lexer) (lexer->eof(lexer))

/// Check to see if a character is a hotkey modifier symbol
#define is_hotkey_modifier(c) (c == '^' || c == '!' || c == '#' || c == '+' || \
                               c == '<' || c == '>' || c == '~' || c == '$')

/// Check to see if an identifier is an AltTab command
#define is_alttab_command(ident) \
  (strcaseeq_any(ident, "AltTab", "ShiftAltTab", "AltTabMenu", "AltTabAndMenu", "AltTabMenuDismiss"))

/// Check to see if ident is an operator keyword like "and" or "is". Get `ident` from skip_identifier
#define is_operator_keyword(ident) \
  (strcaseeq_any(ident, "and", "not", "is", "or", "contains"))

/// Check to see if a character could start an operator keyword
#define starts_operator_keyword(c) (c == 'a' || c == 'A' || c == 'n' || c == 'N' || \
                                    c == 'i' || c == 'I' || c == 'o' || c == 'O' || \
                                    c == 'c' || c == 'C')

/// Check to see if ident is a control-flow keyword like "if"
#define is_flow_keyword(ident) \
  (strcaseeq_any(ident, "if", "else", "while", "for", "loop", "throw", "try", "catch", \
    "finally", "break", "continue", "as", "in", "switch", "case", "default", "goto", "return"))

/// Check to see if ident is a reserved word in general
#define is_keyword(ident) (is_operator_keyword(ident) || is_flow_keyword(ident))

enum TokenType {
  OPTIONAL_MARKER,
  FUNCTION_DEF_MARKER,
  METHOD_DEF_MARKER,
  EMPTY_ARG,
  IMPLICIT_CONCAT_MARKER,
  CONTINUATION_SECTION_START,
  CONTINUATION_NEWLINE,
  EOL,
  BLOCK_COMMENT,
  ARRAY_EXPANSION_MARKER,
  HOTKEY_DOUBLE_COLON,
  REMAP_DOUBLE_COLON
};

void *tree_sitter_autohotkey_external_scanner_create() { return NULL; }
void tree_sitter_autohotkey_external_scanner_destroy(void *payload) {}
void tree_sitter_autohotkey_external_scanner_reset(void *payload) {}
unsigned tree_sitter_autohotkey_external_scanner_serialize(void *payload, char *buffer) { return 0; }
void tree_sitter_autohotkey_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {}

/// @brief Skips an identifier, returning its length and putting up to the first `buf_size` characters of it into
///        `buf` for later comparison.
/// @param lexer the lexer
/// @param buf buffer in which to store characters. Can be null (but `buf_size` must be 0)
/// @param buf_size size of `buf` in characters
/// @return the total number of characters skipped
static int skip_identifier(TSLexer *lexer, char *buf, int buf_size) {
  int len = 0;
  while (is_identifier_char(lexer->lookahead)) {
    if (buf && len < buf_size - 1) {
      buf[len] = (char)(lexer->lookahead);
    }
    len++;
    lexer->advance(lexer, false);
  }

  if (buf && len < buf_size)
    buf[len] = '\0';

  return len;
}

/// @brief Skips horizontal whitespace (not including newlines)
/// @param lexer lexer
/// @return true if any space was skipped, false if not
static inline bool skip_horizontal_ws(TSLexer *lexer) {
  bool skipped = false;

  while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
    lexer->advance(lexer, false);
    skipped = true;
  }

  return skipped;
}

/// @brief Case-insensitive string comparison
static inline bool strcaseeq(const char *a, const char *b) {
  while (*a && *b) {
    if (tolower(*a) != tolower(*b)){
      return false;
    }
    a++; b++;
  }
  return *a == *b;
}

/// @brief Forward scan to see if the next statement is a function or method declaration. This is required to
///        differentiate `function_call block` from `function_declaration`, since e.g. `MyFunnc(arg)` could be the 
///        start of either. Methods and functions are structurally similar but have slightly different naming
///        constraints
///        Call `lexer->mark_end` before this
/// @param lexer tree-sitter lexer
/// @param method true to scan for a method instead of a function
/// @return true if the next statement is a function declaration, false otherwise
static bool is_function_declaration(TSLexer *lexer, bool method) {
  // Skip any leading whitespace (including newlines)
  skip_whitespace(lexer);

  if (!is_identifier_char(lexer->lookahead)) {
    return false;
  }

  char ident[16];
  skip_identifier(lexer, ident, sizeof(ident));

  // Methods can be static, as can functions that aren't in the auto-execute section
  if (strcaseeq(ident, "static")) {
    if (!skip_horizontal_ws(lexer)) {
      return false;  // need space after static
    }

    if (!is_identifier_char(lexer->lookahead)) {
       return false;
    }

    // don't need to capture name but there must be an identifier after 'static'
    if(skip_identifier(lexer, NULL, 0) == 0) {
      return false;
    }
  }
  else if(!method && is_keyword(ident)) {
    // Functions cannot shadow keywords (methods can)
    return false;
  }
  
  // Expect '('
  if (lexer->lookahead != '(') {
    return false;
  }
  lexer->advance(lexer, false);
  
  // Match parens...
  int depth = 1;
  while (depth > 0 && lexer->lookahead != 0) {
    if (lexer->lookahead == '(') depth++;
    else if (lexer->lookahead == ')') depth--;
    lexer->advance(lexer, false);
  }
  if (depth != 0) return false;

  // Skip all whitespace (including newlines), check for '{' or '=>'
  skip_whitespace(lexer);

  // Function body can start with either '{' or '=>'
  if (lexer->lookahead == '{') {
    return true;
  }
  if (lexer->lookahead == '=') {
    lexer->advance(lexer, false);
    return lexer->lookahead == '>';
  }

  return false;
}

/// @brief Check to see if the next token is an optional marker (as opposed to the "?" of a
///        ternary expression)
/// @param lexer the lexer
/// @return true if an optional marker, false otherwise
static bool is_optional_marker(TSLexer *lexer) {
  // must be a "?"
  if( lexer->lookahead != '?') {
    return false;
  }

  // Consume the '?'
  lexer->advance(lexer, false);

  // Skip whitespace after '?'
  skip_whitespace(lexer);

  // Check that what follows is one of: ) ] } , : or EOF
  // Per AHK docs: "The question mark must be followed by one of the following symbols: )]},:."
  return (
    lexer->lookahead == ')' ||
    lexer->lookahead == ']' ||
    lexer->lookahead == '}' ||
    lexer->lookahead == ',' ||
    lexer->lookahead == ':' ||
    lexer->eof(lexer)
  );
}

/// @brief Determines whether the currenty token is an empty arg. Call mark_end before
///        calling this
/// @param lexer the lexer
/// @return true if an empty argument, false otherwise
static bool is_empty_arg(TSLexer *lexer) {
  skip_whitespace(lexer);

  // We don't track empty args for trailing commas because MsgBox("Hello",) is syntactically identical
  // to just MsgBox("Hello"). Also, it's kind of a nightmare
  return (lexer->lookahead == ',');
}

#define is_operator_start(c) (c == '?' || c == '*' || c == '/' || c == '<' || c == '>' || \
                              c == '=' || c == '^' || c == '|' || c == '&' || c == '!' || \
                              c == '~' || c == ':' || c == '.' || c == ',')
                              // Note: +, - excluded (could be unary in concat context)

/// Characters that can start a single expression
#define is_expression_start(c) (is_identifier_char(c) ||                                  \
                                c == '_' || c == '"' || c == '\'' || c == '(' ||          \
                                c == '+' || c == '-' ||                                   \
                                c == '%')

/// @brief Determines whether this is implicit concatenation. As a side effect, may call `lexer->mark_end`. Definitely
///        calls it if it returns true. 
/// @param lexer the lexer
/// @return true if implicit concatenation, false otherwise
static bool is_implicit_concatenation(TSLexer *lexer) {

  // Must be followed by whitespace
  if(!skip_horizontal_ws(lexer)) {
    return false;
  }

  // Cannot hit EOL (or EOF)
  if(is_eol(lexer->lookahead) || is_eof(lexer)) {
    return false;
  }

  // Can't be an operator
  if(is_operator_start(lexer->lookahead)) {
    return false;
  }

  if(is_expression_start(lexer->lookahead)) {
    // Prefix addition/subtraction can't start implicit concatenation for some reason
    if(lexer->lookahead == '+') {
      // mark end here so we don't consume the operator
      lexer->mark_end(lexer);

      lexer->advance(lexer, false);
      // if ++ or we skipped any space, return false
      if(skip_horizontal_ws(lexer) || lexer->lookahead == '+' || is_eof(lexer)) {
        return false;
      }

      skip_horizontal_ws(lexer);
      return !is_eof(lexer) && is_expression_start(lexer->lookahead);
    }
    else if(lexer->lookahead == '-') {
      // mark end here so we don't consume the operator
      lexer->mark_end(lexer);

      lexer->advance(lexer, false);
      // if -- or we skipped any space, return false
      if(skip_horizontal_ws(lexer) || lexer->lookahead == '-' || is_eof(lexer)) {
        return false;
      }

      skip_horizontal_ws(lexer);
      return !is_eof(lexer) && is_expression_start(lexer->lookahead);
    }

    // consume the whitespace we skipped and prevent consumption of the identifier below
    lexer->mark_end(lexer);

    // Check to see if this is an operator keyword
    if(starts_operator_keyword(lexer->lookahead)) {
      char ident[4];
      int len = skip_identifier(lexer, ident, sizeof(ident));

      if(is_operator_keyword(ident)) {
        return false;
      }
    }

    return true;
  }

  return false;
}

/// @brief Checks to see if this is the start of a continuation section. If one is found, the token is consumed, 
///        and mark-end is called
/// @param lexer the lexer.
/// @return true if we found a string continuation start
static bool is_continuation_start(TSLexer* lexer) {
  skip_horizontal_ws(lexer);
  if(is_eof(lexer))
    return false;

  if(!is_eol(lexer->lookahead)) {
    // "(" must start on new line
    return false;
  }

  skip_whitespace(lexer);
  if(lexer->lookahead != '(') {
    return false;
  }

  lexer->advance(lexer, false);
  lexer->mark_end(lexer);
  skip_horizontal_ws(lexer);

  // scan ahead to ensure that we only find continuation options up until the newline. Anything else and this can't
  // be a continuation section start

  char opt[10] = {0};

  while(!is_eol(lexer->lookahead)) {
    if(is_eof(lexer)) {
      return false;
    }

    memset(opt, '\0', sizeof(opt));

    switch(lexer->lookahead) {
      case 'j':
      case 'J':
        //Join - ensure the first 4 characters are "join" and skip past the rest
        int id_chars = skip_identifier(lexer, opt, 5);
        if(!strcaseeq(opt, "join")) {
          return false;
        }

        // skip the delimiter, which might not have been skipped in skip_identifier if it contains non-identifier
        // characters
        skip_to_whitespace(lexer);
        skip_horizontal_ws(lexer);
        continue;
      
      case 'c':
      case 'C':
        //Comment
        skip_identifier(lexer, opt, sizeof(opt));
        if(!strcaseeq_any(opt, "comments", "comment", "com", "c")) {
          return false;
        }

        skip_horizontal_ws(lexer);
        continue;

      case 'l':
      case 'L':
      case 'r':
      case 'R':
        // ltrim or rtrim option
        skip_identifier(lexer, opt, sizeof(opt));
        if(!strcaseeq_any(opt, "ltrim", "ltrim0", "rtrim0")) {
          return false;
        }

        skip_horizontal_ws(lexer);
        continue;

      case '`':
        // literal backtick option, allowed
        lexer->advance(lexer, false);
        skip_horizontal_ws(lexer);
        continue;

      default:
        // not a continuation section option
        return false;
    }
  }

  return true;
}

/// @brief Scans for a newline - to be used in continuation sections. The newline is consumed and mark_end is called
///        if one is found. The grammar should be careful about when this is used - whitespace is generally not
///        significant.
/// @param lexer the lexer
/// @return true if a newline was found, false if not
static bool scan_continuation_newline(TSLexer *lexer) {
  skip_horizontal_ws(lexer);
  if(is_eof(lexer))
    return false;

  if(is_eol(lexer->lookahead)) {
    // Keep leading whitespace after the newline since it may be relevant to users
    skip_eol(lexer);
    lexer->mark_end(lexer);
    return true;
  }

  return false;
}

/// @brief Checks if we're at the end of a directive line (newline, EOF, or comment start).
/// @param lexer the lexer
/// @return true if at a line boundary, false otherwise
static bool is_last_element(TSLexer *lexer) {
  skip_horizontal_ws(lexer);
  return is_eof(lexer) || is_eol(lexer->lookahead) || lexer->lookahead == ';';
}

/// @brief Scans for a block comment. In AHK v2, block comments open with /* and close with */,
///        but the closing */ must be the LAST non-whitespace content on its line. A */ followed by
///        more content on the same line does NOT close the comment.
/// @param lexer the lexer (should be positioned at the start of the potential comment)
/// @return true if a block comment was found and consumed
static bool scan_block_comment(TSLexer *lexer) {
  // Must start with /*
  if (lexer->lookahead != '/') return false;
  lexer->advance(lexer, false);
  if (lexer->lookahead != '*') return false;
  lexer->advance(lexer, false);

  // Scan for closing */ that is the last non-whitespace on its line
  while (!lexer->eof(lexer)) {
    if (lexer->lookahead == '*') {
      lexer->advance(lexer, false);
      if (lexer->eof(lexer)) return false;

      if (lexer->lookahead == '/') {
        lexer->advance(lexer, false);

        // Check if this */ is the last non-whitespace before EOL/EOF
        while (lexer->lookahead == ' ' || lexer->lookahead == '\t') {
          lexer->advance(lexer, false);
        }

        if (is_eol(lexer->lookahead) || lexer->eof(lexer)) {
          // Consume the newline
          if (lexer->lookahead == '\r') lexer->advance(lexer, false);
          if (lexer->lookahead == '\n') lexer->advance(lexer, false);

          // Consume leading whitespace on the next line so that indentation after the
          // comment isn't misinterpreted as implicit concatenation whitespace.
          // We must use advance(false) here, NOT advance(true), because advance(true)
          // moves the token START position forward, which would collapse the span.
          while ((lexer->lookahead == ' ' || lexer->lookahead == '\t') && !lexer->eof(lexer)) {
            lexer->advance(lexer, false);
          }

          lexer->mark_end(lexer);
          return true;
        }

        // */ was not at end of line — continue scanning the comment body
        continue;
      }
      // * not followed by /, continue
      continue;
    }
    lexer->advance(lexer, false);
  }

  // EOF without a valid closing */
  return false;
}

/// @brief Checks if an identifier is a valid AHK key name for remap destinations.
///        See: https://www.autohotkey.com/docs/v2/KeyList.htm
/// @param key null-terminated key name buffer
/// @param len actual length of the identifier (may exceed buffer if truncated)
/// @return true if the identifier is a recognized key name
static bool is_remap_key(const char *key, int len) {
  if (len == 0) return false;

  // Single alphanumeric character is always a valid key (letter or digit key)
  if (len == 1) return is_alnum(key[0]);

  switch (tolower(key[0])) {
    case 'a':
      return strcaseeq_any(key, "Alt", "AppsKey"); 

    case 'b':
      return strcaseeq_any(key, "Backspace", "BS", "Browser_Back", "Browser_Forward", "Browser_Refresh", 
        "Browser_Stop", "Browser_Search", "Browser_Favorites", "Browser_Home");

    case 'c':
      return strcaseeq_any(key, "CapsLock", "Control", "Ctrl", "CtrlBreak"); 

    case 'd':
      return strcaseeq_any(key, "Delete", "Del", "Down"); 

    case 'e':
      return strcaseeq_any(key, "End", "Enter", "Escape", "Esc"); 

    case 'f':
      // F1-F24
      if (len >= 2 && len <= 3 && is_digit(key[1])) {
        int num = key[1] - '0';
        if (len == 3) {
          if (!is_digit(key[2])) return false;
          num = num * 10 + (key[2] - '0');
        }
        return num >= 1 && num <= 24;
      }
      return false;

    case 'h':
      return strcaseeq_any(key, "Help", "Home");

    case 'i':
      return strcaseeq_any(key, "Insert", "Ins"); 

    case 'l':
      return strcaseeq_any(key, "LAlt", "Launch_Mail", "Launch_Media", "Launch_App1", "Launch_App2",
        "LButton", "LControl", "LCtrl", "Left", "LShift", "LWin"); 

    case 'm':
      return strcaseeq_any(key, "MButton", "Media_Next", "Media_Prev", "Media_Stop", "Media_Play_Pause"); 

    case 'n':
      if (strcaseeq(key, "NumLock")) return true;
      // Numpad keys: Numpad0-9 and named variants
      if (len >= 7 && tolower(key[1]) == 'u' && tolower(key[2]) == 'm' &&
          tolower(key[3]) == 'p' && tolower(key[4]) == 'a' && tolower(key[5]) == 'd') {
        const char *suffix = key + 6;

        if (len == 7 && is_digit(suffix[0])) return true;  // Numpad0-Numpad9

        return strcaseeq_any(suffix, "Ins", "End", "Down", "PgDn", "Left", "Clear", "Right", "Home",
          "Up", "PgUp", "Del", "Dot", "Div", "Mult", "Add", "Sub", "Enter");
      }
      return false;

    case 'p':
      return strcaseeq_any(key, "Pause", "PgDn", "PgUp", "PrintScreen"); 

    case 'r':
      return strcaseeq_any(key, "RAlt", "RButton", "RControl", "RCtrl", "Right", "RShift", "RWin");

    case 's':
      if (strcaseeq_any(key, "ScrollLock", "Shift", "Sleep", "Space")) {
        return true;
      }
      // Sc scan codes: Sc followed by 3 hex digits
      if (len == 5 && tolower(key[1]) == 'c') {
        return is_xdigit(key[2]) && is_xdigit(key[3]) && is_xdigit(key[4]);
      }
      return false;

    case 't':
      return strcaseeq_any(key, "Tab");

    case 'u':
      return strcaseeq_any(key, "Up");

    case 'v':
      if (strcaseeq_any(key, "Volume_Mute", "Volume_Down", "Volume_Up")) {
        return true;
      }
      // Vk virtual key codes: Vk followed by 2 hex digits
      if (len == 4 && tolower(key[1]) == 'k') {
        return is_xdigit(key[2]) && is_xdigit(key[3]);
      }
      return false;

    case 'w':
      return strcaseeq_any(key, "WheelDown", "WheelUp", "WheelLeft", "WheelRight");

    case 'x':
      return strcaseeq_any(key, "XButton1", "XButton2");

    default:
      return false;
  }
}

/// @brief Main scan function. See https://tree-sitter.github.io/tree-sitter/creating-parsers/4-external-scanners.html#scan
/// @param payload no touching
/// @param lexer the lexer, see the link above
/// @param valid_symbols list of external tokens expected by the parser
/// @return true if a token was succesfuly lexed, false otherwise. Set lexer->result_symbol before returning true
bool tree_sitter_autohotkey_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  // Check optional marker vs ternary operator
  if (valid_symbols[OPTIONAL_MARKER]) {
    if (is_optional_marker(lexer)) {
      lexer->result_symbol = OPTIONAL_MARKER;
      return true;
    }
  }

  // Check for empty arg
  if(valid_symbols[EMPTY_ARG]) {
    lexer->mark_end(lexer);

    if (is_empty_arg(lexer)) {
      lexer->result_symbol = EMPTY_ARG;
      return true;
    }
  }

  if(valid_symbols[IMPLICIT_CONCAT_MARKER]) {
    lexer->mark_end(lexer);

    if(is_implicit_concatenation(lexer)) {
      lexer->result_symbol = IMPLICIT_CONCAT_MARKER;
      return true;
    }
  }

  // Check for array expansion marker vs multiplication operator.
  // Both are '*' immediately after an expression; we disambiguate by looking ahead:
  // array expansion is always the last thing in an arg list, so '*' must be followed by ')' or ']'.
  if (valid_symbols[ARRAY_EXPANSION_MARKER] && lexer->lookahead == '*') {
    lexer->advance(lexer, false);
    lexer->mark_end(lexer);

    // Skip whitespace to see what follows
    skip_whitespace(lexer);

    if (lexer->lookahead == ')' || lexer->lookahead == ']') {
      lexer->result_symbol = ARRAY_EXPANSION_MARKER;
      return true;
    }

    // Not array expansion — it's a multiplication operator.
    // No other external token starts with '*', so return false to let the regular lexer handle it.
    return false;
  }

  if(valid_symbols[CONTINUATION_SECTION_START]) {
    lexer->mark_end(lexer);

    if(is_continuation_start(lexer)) {
      lexer->result_symbol = CONTINUATION_SECTION_START;
      return true;
    }
  }

  if(valid_symbols[CONTINUATION_NEWLINE]) {
    lexer->mark_end(lexer);

    if(scan_continuation_newline(lexer)) {
      lexer->result_symbol = CONTINUATION_NEWLINE;
      return true;
    }
  }

  // Disambiguate hotkey :: from remap :: by looking ahead after "::"
  // A remap is: trigger :: [modifiers] key EOL (single key on same line)
  // A hotkey is: trigger :: body (anything else)
  if (valid_symbols[HOTKEY_DOUBLE_COLON] || valid_symbols[REMAP_DOUBLE_COLON]) {
    if (lexer->lookahead == ':') {
      lexer->advance(lexer, false);
      if (lexer->lookahead == ':') {
        lexer->advance(lexer, false);
        lexer->mark_end(lexer);  // token is just "::"

        // Look ahead to determine if this is a remap or hotkey
        // Skip optional hotkey modifier symbols
        while (is_hotkey_modifier(lexer->lookahead)) {
          lexer->advance(lexer, false);
        }

        // Check what follows to determine if this is a remap destination
        bool found_key = false;

        if (is_identifier_char(lexer->lookahead)) {
          // Word-like key: read identifier and validate against key list
          char key_buf[24] = {0};
          int key_len = skip_identifier(lexer, key_buf, sizeof(key_buf));

          // AltTab commands are hotkey bodies, not remap destinations
          if (is_alttab_command(key_buf)) {
            goto hotkey_colon;
          }

          found_key = is_remap_key(key_buf, key_len);
        } else if (lexer->lookahead == '`') {
          // Backtick escape sequence (e.g., `{ for literal open brace)
          lexer->advance(lexer, false);
          if (!is_eol(lexer->lookahead) && !is_eof(lexer)) {
            lexer->advance(lexer, false);  // consume the escaped char
            found_key = true;
          }
        } else if (!is_eol(lexer->lookahead) && !is_eof(lexer) &&
                   lexer->lookahead != ' ' && lexer->lookahead != '\t' &&
                   lexer->lookahead != '{') {
          // Single non-identifier char key (e.g., }, (, -, .)
          // Excludes { which starts a hotkey body block
          lexer->advance(lexer, false);
          found_key = true;
        }

        if (found_key) {
          // After the key, must be EOL (nothing else on the line)
          skip_horizontal_ws(lexer);
          if (is_eol(lexer->lookahead) || is_eof(lexer) || lexer->lookahead == ';') {
            if (valid_symbols[REMAP_DOUBLE_COLON]) {
              lexer->result_symbol = REMAP_DOUBLE_COLON;
              return true;
            }
          }
        }

        hotkey_colon:
        if (valid_symbols[HOTKEY_DOUBLE_COLON]) {
          lexer->result_symbol = HOTKEY_DOUBLE_COLON;
          return true;
        }
      }
      // Single ":" — not our token, let the regular lexer handle it
      return false;
    }
  }

  if(valid_symbols[EOL]) {
    lexer->mark_end(lexer);

    if(is_last_element(lexer)) {
      lexer->result_symbol = EOL;
      return true;
    }
  }

  // Check function declaration vs function definition
  // We need to check this last.
  if (valid_symbols[FUNCTION_DEF_MARKER]) {
    lexer->mark_end(lexer);
    
    if (is_function_declaration(lexer, false)) {
      lexer->result_symbol = FUNCTION_DEF_MARKER;
      return true;
    }
  }

  if (valid_symbols[METHOD_DEF_MARKER]) {
    lexer->mark_end(lexer);
    
    if (is_function_declaration(lexer, true)) {
      lexer->result_symbol = METHOD_DEF_MARKER;
      return true;
    }
  }

  // Check for block comment — must be checked last since it's an extra
  if (valid_symbols[BLOCK_COMMENT] && lexer->lookahead == '/') {
    if (scan_block_comment(lexer)) {
      lexer->result_symbol = BLOCK_COMMENT;
      return true;
    }
  }

  return false;
}