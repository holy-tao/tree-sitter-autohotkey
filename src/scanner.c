#include "tree_sitter/parser.h"
#include <ctype.h>

// This external scanner currently handles lookaheads for:
//  1.  Optional markers ("?") to differentiate them from ternary expressions
//  2.  Function declarations

// tree-sitter characters are of type int32_t, <ctypes> expects chars, so we roll our own macros

#define is_alpha(c) ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z'))
#define is_alnum(c) (is_alpha(c) || (c >= '0' && c <= '9'))
#define is_identifier_char(c) (is_alnum(c) || (c == '_'))
#define is_whitespace(c) (c == ' ' || c == '\t' || c == '\n' || c == '\r')

/// Skips all whitespace, including newlines
#define skip_whitespace(lexer)  while (is_whitespace(lexer->lookahead)) { \
                                  lexer->advance(lexer, true);            \
                                }

enum TokenType {
  OPTIONAL_MARKER,
  FUNCTION_DEF_MARKER,
  EMPTY_ARG
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

/// @brief Forward scan to see if the next statement is a function declaration. This is required to differentiate
///        `function_call block` from `function_declaration`, since e.g. `MyFunnc(arg)` could be the start of either.
///        Call `lexer->mark_end` before this
/// @param lexer tree-sitter lexer
/// @return true if the next statement is a function declaration, false otherwise
static bool is_function_declaration(TSLexer *lexer) {
  // Skip any leading whitespace (including newlines)
  skip_whitespace(lexer);

  if (!is_identifier_char(lexer->lookahead)) {
    return false;
  }

  char ident[16];
  skip_identifier(lexer, ident, sizeof(ident));

  // If 'static', consume it and get the real name
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

  // Check function declaration vs function definition
  // We need to check this last.
  if (valid_symbols[FUNCTION_DEF_MARKER]) {
    lexer->mark_end(lexer);
    
    if (is_function_declaration(lexer)) {
      lexer->result_symbol = FUNCTION_DEF_MARKER;
      return true;
    }
  }

  return false;
}