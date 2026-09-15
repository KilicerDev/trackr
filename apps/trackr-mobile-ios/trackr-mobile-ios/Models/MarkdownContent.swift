//
//  MarkdownContent.swift
//  trackr-mobile-ios
//
//  Markdown → NoteBlock. Task / ticket descriptions and comment bodies are
//  markdown (the web stores them as such); notes/wiki are HTML. Both feed
//  the same RichContentView so every body reads the same way.
//
//  Blocks: headings (#), paragraphs, ordered/unordered lists with
//  indentation nesting, task lists (- [ ] / - [x]), quotes (>), fenced
//  code, dividers. Inline: bold / italic / strike / code / links via
//  Foundation's markdown parser, plus the app's `@[Name](id)` mention and
//  `~[KEY](task:id)` reference tokens rendered as accent runs.
//

import SwiftUI

enum MarkdownParser {
    static func parse(_ markdown: String) -> [NoteBlock] {
        var blocks: [NoteBlock] = []
        let lines = markdown.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        var paragraph: [String] = []
        var index = 0

        func flushParagraph() {
            guard !paragraph.isEmpty else { return }
            let text = paragraph.joined(separator: " ")
            blocks.append(NoteBlock(kind: .paragraph(inline(text))))
            paragraph = []
        }

        while index < lines.count {
            let raw = lines[index]
            let line = raw.trimmingCharacters(in: .whitespaces)

            if line.isEmpty {
                flushParagraph()
                index += 1
                continue
            }
            // Fenced code.
            if line.hasPrefix("```") {
                flushParagraph()
                var code: [String] = []
                index += 1
                while index < lines.count, !lines[index].trimmingCharacters(in: .whitespaces).hasPrefix("```") {
                    code.append(lines[index])
                    index += 1
                }
                index += 1
                blocks.append(NoteBlock(kind: .code(code.joined(separator: "\n"))))
                continue
            }
            // Heading.
            if let level = headingLevel(line) {
                flushParagraph()
                let text = String(line.drop(while: { $0 == "#" })).trimmingCharacters(in: .whitespaces)
                blocks.append(NoteBlock(kind: .heading(level: min(level, 3), text: inline(text))))
                index += 1
                continue
            }
            // Divider.
            if line == "---" || line == "***" || line == "___" {
                flushParagraph()
                blocks.append(NoteBlock(kind: .divider))
                index += 1
                continue
            }
            // Quote (consecutive > lines).
            if line.hasPrefix(">") {
                flushParagraph()
                var quote: [String] = []
                while index < lines.count {
                    let l = lines[index].trimmingCharacters(in: .whitespaces)
                    guard l.hasPrefix(">") else { break }
                    quote.append(String(l.dropFirst()).trimmingCharacters(in: .whitespaces))
                    index += 1
                }
                blocks.append(NoteBlock(kind: .quote(inline(quote.joined(separator: " ")))))
                continue
            }
            // Lists: run of list items (blank line ends the run).
            if listItem(raw) != nil {
                flushParagraph()
                var entries: [ListEntry] = []
                var ordered = false
                var isTaskList = false
                var first = true
                while index < lines.count, let item = listItem(lines[index]) {
                    if first {
                        ordered = item.ordinal != nil
                        isTaskList = item.checked != nil
                        first = false
                    }
                    var entry = ListEntry(text: inline(item.text), depth: item.depth)
                    entry.ordinal = item.ordinal
                    entry.checked = item.checked
                    entries.append(entry)
                    index += 1
                    // Continuation lines (indented, not a new item) join the entry.
                    while index < lines.count, listItem(lines[index]) == nil,
                          !lines[index].trimmingCharacters(in: .whitespaces).isEmpty,
                          lines[index].hasPrefix("  ") {
                        let more = lines[index].trimmingCharacters(in: .whitespaces)
                        entries[entries.count - 1].text = inline(item.text + " " + more)
                        index += 1
                    }
                }
                blocks.append(NoteBlock(kind: isTaskList ? .taskList(entries: entries) : .list(entries: entries, ordered: ordered)))
                continue
            }
            paragraph.append(line)
            index += 1
        }
        flushParagraph()
        return blocks
    }

    // MARK: - Line classification

    private static func headingLevel(_ line: String) -> Int? {
        let hashes = line.prefix(while: { $0 == "#" }).count
        guard hashes > 0, hashes <= 6, line.dropFirst(hashes).first == " " else { return nil }
        return hashes
    }

    private struct Item {
        var text: String
        var depth: Int
        var ordinal: Int?
        var checked: Bool?
    }

    private static let orderedRegex = try! NSRegularExpression(pattern: "^(\\d+)[.)]\\s+(.*)$")
    private static let bulletRegex = try! NSRegularExpression(pattern: "^[-*+]\\s+(.*)$")
    private static let taskRegex = try! NSRegularExpression(pattern: "^[-*+]\\s+\\[( |x|X)\\]\\s*(.*)$")

    private static func listItem(_ raw: String) -> Item? {
        let indent = raw.prefix(while: { $0 == " " || $0 == "\t" })
        let depth = indent.reduce(0) { $0 + ($1 == "\t" ? 2 : 1) } / 2
        let line = String(raw.dropFirst(indent.count))
        let range = NSRange(location: 0, length: (line as NSString).length)
        if let m = taskRegex.firstMatch(in: line, range: range) {
            let mark = (line as NSString).substring(with: m.range(at: 1))
            return Item(text: (line as NSString).substring(with: m.range(at: 2)), depth: depth,
                        ordinal: nil, checked: mark.lowercased() == "x")
        }
        if let m = orderedRegex.firstMatch(in: line, range: range) {
            return Item(text: (line as NSString).substring(with: m.range(at: 2)), depth: depth,
                        ordinal: Int((line as NSString).substring(with: m.range(at: 1))), checked: nil)
        }
        if let m = bulletRegex.firstMatch(in: line, range: range) {
            return Item(text: (line as NSString).substring(with: m.range(at: 1)), depth: depth,
                        ordinal: nil, checked: nil)
        }
        return nil
    }

    // MARK: - Inline

    /// Inline markdown with the app's mention / reference tokens turned into
    /// accent runs. Tokens are rewritten to links with private schemes first
    /// so the markdown parser keeps them intact.
    static func inline(_ text: String) -> AttributedString {
        var source = Mentions.regex.stringByReplacingMatches(
            in: text, range: NSRange(location: 0, length: (text as NSString).length),
            withTemplate: "[@$1](trackr-mention://$2)"
        )
        source = Mentions.refRegex.stringByReplacingMatches(
            in: source, range: NSRange(location: 0, length: (source as NSString).length),
            withTemplate: "[$1](trackr-ref://$2)"
        )
        var options = AttributedString.MarkdownParsingOptions()
        options.interpretedSyntax = .inlineOnlyPreservingWhitespace
        options.failurePolicy = .returnPartiallyParsedIfPossible
        guard var result = try? AttributedString(markdown: source, options: options) else {
            return AttributedString(text)
        }
        for run in result.runs {
            guard let link = run.link, let scheme = link.scheme,
                  scheme == "trackr-mention" || scheme == "trackr-ref" else { continue }
            result[run.range].link = nil
            result[run.range].foregroundColor = .accentColor
            result[run.range].inlinePresentationIntent = .stronglyEmphasized
        }
        return result
    }

    /// True when the text carries block markdown (lists, headings, fences,
    /// quotes) — plain one-liners stay on the cheaper Text path.
    static func hasBlockSyntax(_ text: String) -> Bool {
        text.contains("\n") && text.split(separator: "\n").contains { line in
            let l = line.trimmingCharacters(in: .whitespaces)
            return listItem(String(line)) != nil || headingLevel(l) != nil
                || l.hasPrefix(">") || l.hasPrefix("```") || l == "---"
        }
    }
}
