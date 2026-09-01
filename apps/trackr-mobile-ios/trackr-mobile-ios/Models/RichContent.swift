//
//  RichContent.swift
//  trackr-mobile-ios
//
//  Parses the server's derived body_html (the small, fixed TipTap schema
//  from web/src/lib/editor/extensions.ts) into native blocks for
//  RichContentView. Zero dependencies: the HTML is machine-generated and
//  well-formed, so Foundation's XMLParser handles it after void tags are
//  self-closed.
//

import SwiftUI

struct ListEntry: Identifiable, Hashable {
    let id = UUID()
    var text: AttributedString
    var depth = 0
    var ordinal: Int?  // ordered lists only
    var checked: Bool?  // task lists only
}

struct NoteBlock: Identifiable, Hashable {
    enum Kind: Hashable {
        case heading(level: Int, text: AttributedString)
        case paragraph(AttributedString)
        case list(entries: [ListEntry], ordered: Bool)
        case taskList(entries: [ListEntry])
        case quote(AttributedString)
        case code(String)
        case divider
        // `alt` carries the original filename (set by the web image upload)
        // so the full-size QuickLook temp file can keep its real name.
        case image(src: String, alt: String?)
        case file(id: String, filename: String, sizeBytes: Int?)
    }

    let id = UUID()
    var kind: Kind
}

enum RichContentParser {
    static func parse(_ html: String) -> [NoteBlock] {
        guard !html.isEmpty else { return [] }
        guard let root = HTMLTree.parse(prepared(html)) else {
            // Malformed markup: strip tags and keep the text readable.
            let plain = html
                .replacingOccurrences(of: "<[^>]+>", with: " ", options: .regularExpression)
                .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
                .trimmingCharacters(in: .whitespacesAndNewlines)
            return plain.isEmpty ? [] : [NoteBlock(kind: .paragraph(AttributedString(plain)))]
        }
        return blocks(in: root)
    }

    /// The HTML named entities the serializer or legacy hand-authored pages
    /// may contain. XMLParser only knows the five XML entities — any other
    /// named entity aborts the whole parse, so they're substituted up front.
    private static let namedEntities: [(String, String)] = [
        ("&nbsp;", "\u{00A0}"), ("&mdash;", "—"), ("&ndash;", "–"),
        ("&hellip;", "…"), ("&rsquo;", "\u{2019}"), ("&lsquo;", "\u{2018}"),
        ("&rdquo;", "\u{201D}"), ("&ldquo;", "\u{201C}"), ("&copy;", "©"),
        ("&reg;", "®"), ("&trade;", "™"), ("&deg;", "°"), ("&middot;", "·"),
        ("&bull;", "•"), ("&times;", "×"), ("&euro;", "€"), ("&pound;", "£"),
        ("&sect;", "§"), ("&para;", "¶"), ("&laquo;", "«"), ("&raquo;", "»"),
        ("&auml;", "ä"), ("&ouml;", "ö"), ("&uuml;", "ü"),
        ("&Auml;", "Ä"), ("&Ouml;", "Ö"), ("&Uuml;", "Ü"), ("&szlig;", "ß"),
    ]

    /// XMLParser needs well-formed XML: self-close the HTML void elements,
    /// swap named entities for their characters, and drop a doctype if a
    /// legacy page carries one.
    private static func prepared(_ html: String) -> String {
        var closed = html
            .replacingOccurrences(
                of: "<!DOCTYPE[^>]*>", with: "",
                options: [.regularExpression, .caseInsensitive]
            )
        for (entity, replacement) in namedEntities {
            closed = closed.replacingOccurrences(of: entity, with: replacement)
        }
        closed = closed.replacingOccurrences(
            of: "<(br|hr|img|input|source|track|wbr|area|base|col|embed|link|meta)((?:[^>\"]|\"[^\"]*\")*?)\\s*/?>",
            with: "<$1$2/>",
            options: [.regularExpression, .caseInsensitive]
        )
        return "<root>\(closed)</root>"
    }

    // MARK: - Block conversion

    private static func blocks(in node: HTMLNode) -> [NoteBlock] {
        var out: [NoteBlock] = []
        for child in node.children {
            switch child.name {
            case "#text":
                let text = child.text.trimmingCharacters(in: .whitespacesAndNewlines)
                if !text.isEmpty { out.append(NoteBlock(kind: .paragraph(AttributedString(text)))) }
            case "h1", "h2", "h3":
                let level = Int(String(child.name.dropFirst())) ?? 2
                out.append(NoteBlock(kind: .heading(level: level, text: inline(child))))
            case "p":
                let text = inline(child)
                if !text.characters.isEmpty { out.append(NoteBlock(kind: .paragraph(text))) }
            case "ul" where child.attrs["data-type"] == "taskList":
                out.append(NoteBlock(kind: .taskList(entries: taskEntries(child, depth: 0))))
            case "ul", "ol":
                let ordered = child.name == "ol"
                out.append(NoteBlock(kind: .list(
                    entries: listEntries(child, ordered: ordered, depth: 0), ordered: ordered
                )))
            case "blockquote":
                out.append(NoteBlock(kind: .quote(joinedParagraphs(child))))
            case "pre":
                out.append(NoteBlock(kind: .code(
                    rawText(child).trimmingCharacters(in: .newlines)
                )))
            case "hr":
                out.append(NoteBlock(kind: .divider))
            case "img":
                if let src = child.attrs["src"] {
                    out.append(NoteBlock(kind: .image(src: src, alt: child.attrs["alt"])))
                }
            case "a" where child.attrs["data-file-attachment"] != nil:
                // Block-level file chip from the web editor (extensions.ts
                // FileAttachment atom) — must not degrade into a plain link.
                if let id = child.attrs["data-file-attachment"] {
                    var filename = child.attrs["data-filename"]
                        ?? rawText(child).trimmingCharacters(in: .whitespacesAndNewlines)
                    if filename.isEmpty { filename = "file" }
                    out.append(NoteBlock(kind: .file(
                        id: id, filename: filename,
                        sizeBytes: child.attrs["data-size"].flatMap(Int.init)
                    )))
                }
            default:
                // Unknown wrapper: keep its content rather than dropping it.
                out.append(contentsOf: blocks(in: child))
            }
        }
        return out
    }

    private static func listEntries(_ list: HTMLNode, ordered: Bool, depth: Int) -> [ListEntry] {
        var entries: [ListEntry] = []
        var ordinal = 1
        for li in list.children where li.name == "li" {
            var text = AttributedString()
            var nested: [ListEntry] = []
            for part in li.children {
                switch part.name {
                case "p":
                    if !text.characters.isEmpty { text += AttributedString("\n") }
                    text += inline(part)
                case "ul" where part.attrs["data-type"] == "taskList":
                    nested += taskEntries(part, depth: depth + 1)
                case "ul", "ol":
                    nested += listEntries(part, ordered: part.name == "ol", depth: depth + 1)
                case "#text":
                    let t = part.text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !t.isEmpty { text += AttributedString(t) }
                default:
                    text += inline(part)
                }
            }
            entries.append(ListEntry(text: text, depth: depth, ordinal: ordered ? ordinal : nil))
            ordinal += 1
            entries += nested
        }
        return entries
    }

    /// TipTap task item shape:
    /// <li data-type="taskItem" data-checked="…"><label>…</label><div><p>text</p></div></li>
    private static func taskEntries(_ list: HTMLNode, depth: Int) -> [ListEntry] {
        var entries: [ListEntry] = []
        for li in list.children where li.name == "li" {
            let checked = li.attrs["data-checked"] == "true"
            var text = AttributedString()
            var nested: [ListEntry] = []
            for part in li.children {
                switch part.name {
                case "div", "p":
                    let paragraphs = part.name == "p" ? [part] : part.children.filter { $0.name == "p" }
                    for p in paragraphs {
                        if !text.characters.isEmpty { text += AttributedString("\n") }
                        text += inline(p)
                    }
                case "ul" where part.attrs["data-type"] == "taskList":
                    nested += taskEntries(part, depth: depth + 1)
                default:
                    break  // label/input chrome
                }
            }
            entries.append(ListEntry(text: text, depth: depth, checked: checked))
            entries += nested
        }
        return entries
    }

    private static func joinedParagraphs(_ node: HTMLNode) -> AttributedString {
        var out = AttributedString()
        for child in node.children where child.name == "p" {
            if !out.characters.isEmpty { out += AttributedString("\n") }
            out += inline(child)
        }
        return out.characters.isEmpty ? inline(node) : out
    }

    private static func rawText(_ node: HTMLNode) -> String {
        node.children.reduce(into: "") { acc, child in
            acc += child.name == "#text" ? child.text : rawText(child)
        }
    }

    // MARK: - Inline marks

    private static func inline(_ node: HTMLNode) -> AttributedString {
        var out = AttributedString()
        for child in node.children {
            switch child.name {
            case "#text":
                out += AttributedString(child.text.replacingOccurrences(of: "\n", with: " "))
            case "br":
                out += AttributedString("\n")
            default:
                var inner = inline(child)
                switch child.name {
                case "strong", "b": applyIntent(&inner, .stronglyEmphasized)
                case "em", "i": applyIntent(&inner, .emphasized)
                case "s", "del", "strike": applyIntent(&inner, .strikethrough)
                case "code": applyIntent(&inner, .code)
                case "a":
                    if let href = child.attrs["href"], let url = URL(string: href) {
                        inner.link = url
                    }
                default: break
                }
                out += inner
            }
        }
        return out
    }

    private static func applyIntent(_ text: inout AttributedString, _ intent: InlinePresentationIntent) {
        let snapshot = text
        for run in snapshot.runs {
            let merged = (run.inlinePresentationIntent ?? []).union(intent)
            text[run.range].inlinePresentationIntent = merged
        }
    }
}

// MARK: - Minimal DOM over XMLParser

private final class HTMLNode {
    let name: String
    let attrs: [String: String]
    var children: [HTMLNode] = []
    var text: String

    init(name: String, attrs: [String: String] = [:], text: String = "") {
        self.name = name
        self.attrs = attrs
        self.text = text
    }
}

private final class HTMLTree: NSObject, XMLParserDelegate {
    private var stack: [HTMLNode] = []
    private var root: HTMLNode?

    static func parse(_ xml: String) -> HTMLNode? {
        let builder = HTMLTree()
        let parser = XMLParser(data: Data(xml.utf8))
        parser.delegate = builder
        guard parser.parse() else { return nil }
        return builder.root
    }

    func parser(
        _ parser: XMLParser, didStartElement elementName: String,
        namespaceURI: String?, qualifiedName: String?, attributes attributeDict: [String: String]
    ) {
        let node = HTMLNode(name: elementName, attrs: attributeDict)
        if let parent = stack.last {
            parent.children.append(node)
        } else {
            root = node
        }
        stack.append(node)
    }

    func parser(
        _ parser: XMLParser, didEndElement elementName: String,
        namespaceURI: String?, qualifiedName: String?
    ) {
        stack.removeLast()
    }

    func parser(_ parser: XMLParser, foundCharacters string: String) {
        guard let parent = stack.last else { return }
        if let last = parent.children.last, last.name == "#text" {
            last.text += string
        } else {
            parent.children.append(HTMLNode(name: "#text", text: string))
        }
    }
}
