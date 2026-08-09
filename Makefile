LANGUAGE_NAME := tree-sitter-autohotkey
HOMEPAGE_URL := https://github.com/holy-tao/tree-sitter-autohotkey
VERSION := 0.5.6

# repository
SRC_DIR := src

TS ?= tree-sitter

# install directory layout
PREFIX ?= /usr/local
DATADIR ?= $(PREFIX)/share
INCLUDEDIR ?= $(PREFIX)/include
LIBDIR ?= $(PREFIX)/lib
BINDIR ?= $(PREFIX)/bin
PCLIBDIR ?= $(LIBDIR)/pkgconfig

# source/object files
PARSER := $(SRC_DIR)/parser.c
EXTRAS := $(filter-out $(PARSER),$(wildcard $(SRC_DIR)/*.c))
OBJS := $(patsubst %.c,%.o,$(PARSER) $(EXTRAS))

# flags
ARFLAGS ?= rcs
override CFLAGS += -I$(SRC_DIR) -std=c11 -fPIC

# lint tooling
ESLINT ?= ./node_modules/.bin/eslint
MDLINT ?= ./node_modules/.bin/markdownlint-cli2
CLANG_TIDY ?= clang-tidy

# -isystem (not -I) so the vendored src/tree_sitter/*.h don't report warnings.
# -Wno-unused-parameter: the external-scanner ABI fixes the signatures of the
# create/destroy/reset/serialize/deserialize entry points, several of which are
# necessarily stubs here.
SCANNER_LINT_CFLAGS := -std=c11 -isystem $(SRC_DIR) \
	-Wall -Wextra -Wshadow -Wconversion -Wno-unused-parameter

# ABI versioning
SONAME_MAJOR = $(shell sed -n 's/\#define LANGUAGE_VERSION //p' $(PARSER))
SONAME_MINOR = $(word 1,$(subst ., ,$(VERSION)))

# OS-specific bits
MACHINE := $(shell $(CC) -dumpmachine)

ifneq ($(findstring darwin,$(MACHINE)),)
	SOEXT = dylib
	SOEXTVER_MAJOR = $(SONAME_MAJOR).$(SOEXT)
	SOEXTVER = $(SONAME_MAJOR).$(SONAME_MINOR).$(SOEXT)
	LINKSHARED = -dynamiclib -Wl,-install_name,$(LIBDIR)/lib$(LANGUAGE_NAME).$(SOEXTVER),-rpath,@executable_path/../Frameworks
else ifneq ($(findstring mingw32,$(MACHINE)),)
	SOEXT = dll
	LINKSHARED += -s -shared -Wl,--out-implib,lib$(LANGUAGE_NAME).dll.a
	# A stock LLVM install on Windows has no default sysroot, so clang-tidy can't
	# find <stdlib.h> unless we point it at the mingw triple.
	TIDY_TARGET := --target=x86_64-w64-mingw32
else
	SOEXT = so
	SOEXTVER_MAJOR = $(SOEXT).$(SONAME_MAJOR)
	SOEXTVER = $(SOEXT).$(SONAME_MAJOR).$(SONAME_MINOR)
	LINKSHARED = -shared -Wl,-soname,lib$(LANGUAGE_NAME).$(SOEXTVER)
ifneq ($(filter $(shell uname),FreeBSD NetBSD DragonFly),)
	PCLIBDIR := $(PREFIX)/libdata/pkgconfig
endif
endif

all: lib$(LANGUAGE_NAME).a lib$(LANGUAGE_NAME).$(SOEXT) $(LANGUAGE_NAME).pc

lib$(LANGUAGE_NAME).a: $(OBJS)
	$(AR) $(ARFLAGS) $@ $^

lib$(LANGUAGE_NAME).$(SOEXT): $(OBJS)
	$(CC) $(LDFLAGS) $(LINKSHARED) $^ $(LDLIBS) -o $@
ifneq ($(STRIP),)
	$(STRIP) $@
endif

ifneq ($(findstring mingw32,$(MACHINE)),)
lib$(LANGUAGE_NAME).dll.a: lib$(LANGUAGE_NAME).$(SOEXT)
endif

$(LANGUAGE_NAME).pc: bindings/c/$(LANGUAGE_NAME).pc.in
	sed -e 's|@PROJECT_VERSION@|$(VERSION)|' \
		-e 's|@CMAKE_INSTALL_LIBDIR@|$(LIBDIR:$(PREFIX)/%=%)|' \
		-e 's|@CMAKE_INSTALL_INCLUDEDIR@|$(INCLUDEDIR:$(PREFIX)/%=%)|' \
		-e 's|@PROJECT_DESCRIPTION@|$(DESCRIPTION)|' \
		-e 's|@PROJECT_HOMEPAGE_URL@|$(HOMEPAGE_URL)|' \
		-e 's|@CMAKE_INSTALL_PREFIX@|$(PREFIX)|' $< > $@

$(SRC_DIR)/grammar.json: grammar.js
	$(TS) generate --no-parser $^

$(PARSER): $(SRC_DIR)/grammar.json
	$(TS) generate $^

install: all
	install -d '$(DESTDIR)$(DATADIR)'/tree-sitter/queries/autohotkey '$(DESTDIR)$(INCLUDEDIR)'/tree_sitter '$(DESTDIR)$(PCLIBDIR)' '$(DESTDIR)$(LIBDIR)'
	install -m644 bindings/c/tree_sitter/$(LANGUAGE_NAME).h '$(DESTDIR)$(INCLUDEDIR)'/tree_sitter/$(LANGUAGE_NAME).h
	install -m644 $(LANGUAGE_NAME).pc '$(DESTDIR)$(PCLIBDIR)'/$(LANGUAGE_NAME).pc
	install -m644 lib$(LANGUAGE_NAME).a '$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).a
	install -m755 lib$(LANGUAGE_NAME).$(SOEXT) '$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).$(SOEXTVER)
ifneq ($(findstring mingw32,$(MACHINE)),)
	install -d '$(DESTDIR)$(BINDIR)'
	install -m755 lib$(LANGUAGE_NAME).dll '$(DESTDIR)$(BINDIR)'/lib$(LANGUAGE_NAME).dll
	install -m755 lib$(LANGUAGE_NAME).dll.a '$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).dll.a
else
	install -m755 lib$(LANGUAGE_NAME).$(SOEXT) '$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).$(SOEXTVER)
	cd '$(DESTDIR)$(LIBDIR)' && ln -sf lib$(LANGUAGE_NAME).$(SOEXTVER) lib$(LANGUAGE_NAME).$(SOEXTVER_MAJOR)
	cd '$(DESTDIR)$(LIBDIR)' && ln -sf lib$(LANGUAGE_NAME).$(SOEXTVER_MAJOR) lib$(LANGUAGE_NAME).$(SOEXT)
endif
ifneq ($(wildcard queries/*.scm),)
	install -m644 queries/*.scm '$(DESTDIR)$(DATADIR)'/tree-sitter/queries/autohotkey
endif

uninstall:
	$(RM) '$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).a \
		'$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).$(SOEXTVER) \
		'$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).$(SOEXTVER_MAJOR) \
		'$(DESTDIR)$(LIBDIR)'/lib$(LANGUAGE_NAME).$(SOEXT) \
		'$(DESTDIR)$(INCLUDEDIR)'/tree_sitter/$(LANGUAGE_NAME).h \
		'$(DESTDIR)$(PCLIBDIR)'/$(LANGUAGE_NAME).pc
	$(RM) -r '$(DESTDIR)$(DATADIR)'/tree-sitter/queries/autohotkey

clean:
	$(RM) $(OBJS) $(LANGUAGE_NAME).pc lib$(LANGUAGE_NAME).a lib$(LANGUAGE_NAME).$(SOEXT) lib$(LANGUAGE_NAME).dll.a

test:
	$(TS) test

# Linting. `lint` is what CI runs; `lint-fix` applies every autofix available.
#
# scanner.c is compiled by the tree-sitter CLI during normal development, so we
# never see its compiler warnings -- lint-c does a warnings-only syntax check to
# get them back, then runs clang-tidy (see .clang-tidy) for the deeper analysis.
# parser.c is generated and deliberately not linted.
lint: lint-js lint-md lint-c

lint-js:
	$(ESLINT) .

lint-md:
	$(MDLINT)

lint-c:
	$(CC) -fsyntax-only $(SCANNER_LINT_CFLAGS) $(SRC_DIR)/scanner.c
	$(CLANG_TIDY) $(SRC_DIR)/scanner.c -- $(TIDY_TARGET) $(SCANNER_LINT_CFLAGS)

lint-fix:
	$(ESLINT) . --fix
	$(MDLINT) --fix
	$(CLANG_TIDY) --fix $(SRC_DIR)/scanner.c -- $(TIDY_TARGET) $(SCANNER_LINT_CFLAGS)

.PHONY: all install uninstall clean test lint lint-js lint-md lint-c lint-fix
