; Syntax highlighting queries for tree-sitter-autohotkey.
; Standard tree-sitter capture names, shoudl be usable by editors (Neovim, Helix, …) and used in
; the web playground. Later patterns win over earlier ones on the same range, and narrower (child)
; captures win over wider (parent) ones - the consumer is expected to resolve overlaps that way.

; --- Directives -------------------------------------------------------------
[
  (directive_name)
  (include_ignore_failure)
  (directive_comment)
] @keyword.directive

[
  (file_or_dir_name)
  (lib_name)
  (requirement)
  (version_requirement)
  (warning_type)
  (warning_mode)
  (single_instance_mode)
  (bitness)
] @string

(directive_comment arguments: (directive_arguments) @string)

; Imports are complicated
(import_directive module: (identifier) @type)
(import_directive alias: (identifier) @type)
; Not strictly correct, imports can be variables or functions
(import_directive (export_name export: (identifier) @type))
(import_directive (export_name alias: (identifier) @type))

(module_directive name: (identifier) @type)

; --- Keywords ---------------------------------------------------------------
[
  (if) (else) (while) (for) (loop) (until)
  (return) (break) (continue) (goto)
  (try) (catch) (finally) (throw)
  (switch) (case) (default)
  (class) (extends)
  (get) (set)
  (as) (in) (unset)
  (export) (struct) (global)
] @keyword

; global / static / local
(scope_identifier) @keyword

; --- Labels -----------------------------------------------------------------
(label name: (identifier) @label)
(goto_statement label: (identifier) @label)

; --- Types (classes and structs) --------------------------------------------
; FIXME superclasses can get knarly
(class_declaration name: (identifier) @type)
(class_declaration superclass: (identifier) @type)
(class_declaration superclass: (member_access member: (identifier) @type))

(struct_declaration name: (identifier) @type)
(struct_declaration superclass: (identifier) @type)
(struct_declaration superclass: (identifier) @type)

; Struct type classes (v2.1 - see https://www.autohotkey.com/docs/alpha/Structs.htm#numeric-types).
((identifier) @type 
  (#any-of? @type "Int8" "Int16" "Int32" "Int64" "UInt8" "UInt16" "UInt32" "IntPtr" "Float32" "Float64" ))

; --- Parameters -------------------------------------------------------------
(param_sequence (identifier) @variable.parameter)
(default_param name: (identifier) @variable.parameter)
(optional_param name: (identifier) @variable.parameter)
(variadic_param name: (identifier) @variable.parameter)

; --- Properties & members ---------------------------------------------------
(property_declaration name: (identifier) @property)
(typed_property_declaration name: (identifier) @property)
(member_access member: (identifier) @property)

; --- Function & method definitions ------------------------------------------
(function_declaration name: (identifier) @function)
(function_expression name: (identifier) @function)
(method_declaration name: (identifier) @function.method)
(getter) @function.method
(setter) @function.method

; --- Function & method calls (override @property on the callee) --------------
(function_call function: (identifier) @function.call)
(call_statement function: (identifier) @function.call)
(function_call function: (member_access member: (identifier) @function.method))

; --- Builtin variables ------------------------------------------------------
; A_* automatic variables and `this`.
((identifier) @variable.builtin
  (#match? @variable.builtin "^[Aa]_"))
((identifier) @variable.builtin
  (#eq? @variable.builtin "this"))

; --- Literals ---------------------------------------------------------------
[
  (integer_literal)
  (float_literal)
  (hex_literal)
] @number

(boolean_literal) @constant.builtin

[
  (string_literal)
  (multiline_string_literal)
] @string

; these are basically preprocessor directives, but especially in multiline
; strings they are not part of the actual string
[
  (continuation_join)
  (continuation_ltrim)
  (continuation_ltrim_off)
  (continuation_rtrim_off)
  (continuation_allow_comments)
  (continuation_no_escape)
] @variable

; --- Hotkeys & hotstrings ----------------------------------------------------
(hotkey_trigger) @constant.macro
(hotstring_trigger) @constant.macro
(hotstring_replacement) @string

; --- Comments (last, so they win everywhere) --------------------------------
[
  (line_comment)
  (block_comment)
] @comment
