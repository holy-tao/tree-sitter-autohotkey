#include "tree_sitter/parser.h"
#include <wctype.h>

// This external scanner currently only handles lookaheads for optional markers ("?") to differentiate
// them from ternary expressions

enum TokenType {
  OPTIONAL_MARKER,
};

void *tree_sitter_autohotkey_external_scanner_create() { return NULL; }
void tree_sitter_autohotkey_external_scanner_destroy(void *payload) {}
void tree_sitter_autohotkey_external_scanner_reset(void *payload) {}
unsigned tree_sitter_autohotkey_external_scanner_serialize(void *payload, char *buffer) { return 0; }
void tree_sitter_autohotkey_external_scanner_deserialize(void *payload, const char *buffer, unsigned length) {}

bool tree_sitter_autohotkey_external_scanner_scan(void *payload, TSLexer *lexer, const bool *valid_symbols) {
  // Only try to match optional_marker if it's valid in this context
  if (!valid_symbols[OPTIONAL_MARKER]) {
    return false;
  }

  // Must start with '?'
  if (lexer->lookahead != '?') {
    return false;
  }

  // Consume the '?'
  lexer->advance(lexer, false);

  // Skip whitespace after '?'
  while (iswspace(lexer->lookahead)) {
    lexer->advance(lexer, true);
  }

  // Check that what follows is one of: ) ] } , : or EOF
  // Per AHK docs: "The question mark must be followed by one of the following symbols: )]},:."
  bool valid_follower = (
    lexer->lookahead == ')' ||
    lexer->lookahead == ']' ||
    lexer->lookahead == '}' ||
    lexer->lookahead == ',' ||
    lexer->lookahead == ':' ||
    lexer->eof(lexer)
  );

  if (valid_follower) {
    lexer->result_symbol = OPTIONAL_MARKER;
    return true;
  }

  return false;
}
