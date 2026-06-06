import XCTest
import SwiftTreeSitter
import TreeSitterAutohotkey

final class TreeSitterAutohotkeyTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_autohotkey())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading AutoHotkey grammar")
    }
}
