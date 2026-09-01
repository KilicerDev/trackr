//
//  MentionText.swift
//  trackr-mobile-ios
//
//  @-mention rendering. Comment/message bodies store mentions as
//  `@[Display Name](userId)` tokens (web utils/mentions.ts) — render them
//  as accent-tinted `@Name` runs instead of showing the raw token. Entity
//  refs (`~[SIWEB-15](task:id)`, web utils/refs.ts) render as accent-tinted
//  display ids the same way.
//

import SwiftUI

enum Mentions {
    /// `@[Name](id)` — capture 1 = display name, capture 2 = user id.
    static let regex = try! NSRegularExpression(pattern: "@\\[([^\\]]+)\\]\\(([^)]+)\\)")

    /// `~[SIWEB-15](task:id)` — capture 1 = display id (web REF_RE parity).
    static let refRegex = try! NSRegularExpression(
        pattern: "~\\[([^\\]]+)\\]\\((?:ticket|task|project):([^)]+)\\)"
    )

    /// Rich form for message bodies: mention tokens become accent-colored,
    /// medium-weight `@Name` runs.
    /// `<https://…>` markdown autolinks — the brackets are noise on mobile.
    private static let autolinkRegex = try! NSRegularExpression(pattern: "<(https?://[^>\\s]+)>")
    private static let linkDetector = try! NSDataDetector(types: NSTextCheckingResult.CheckingType.link.rawValue)

    static func attributed(_ text: String) -> AttributedString {
        var out = AttributedString()
        let text = autolinkRegex.stringByReplacingMatches(
            in: text, range: NSRange(location: 0, length: (text as NSString).length), withTemplate: "$1"
        )
        let ns = text as NSString
        let full = NSRange(location: 0, length: ns.length)
        // Interleave mention and ref tokens in document order.
        let tokens: [(match: NSTextCheckingResult, isMention: Bool)] =
            (regex.matches(in: text, range: full).map { ($0, true) }
                + refRegex.matches(in: text, range: full).map { ($0, false) })
            .sorted { $0.0.range.location < $1.0.range.location }
        var cursor = 0
        for (match, isMention) in tokens {
            if match.range.location > cursor {
                out += linkified(
                    ns.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
                )
            }
            let display = ns.substring(with: match.range(at: 1))
            var run = AttributedString(isMention ? "@\(display)" : display)
            run.foregroundColor = .accentColor
            run.inlinePresentationIntent = .stronglyEmphasized
            out += run
            cursor = match.range.location + match.range.length
        }
        if cursor < ns.length {
            out += linkified(ns.substring(from: cursor))
        }
        return out
    }

    /// Plain text with http(s) URLs turned into tappable, accent-colored
    /// links (web MentionText `link` token parity).
    private static func linkified(_ text: String) -> AttributedString {
        var out = AttributedString()
        let ns = text as NSString
        var cursor = 0
        for match in linkDetector.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            guard let url = match.url, let scheme = url.scheme?.lowercased(),
                  scheme == "http" || scheme == "https" else { continue }
            if match.range.location > cursor {
                out += AttributedString(
                    ns.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
                )
            }
            var link = AttributedString(ns.substring(with: match.range))
            link.link = url
            link.foregroundColor = .accentColor
            link.underlineStyle = .single
            out += link
            cursor = match.range.location + match.range.length
        }
        if cursor < ns.length {
            out += AttributedString(ns.substring(from: cursor))
        }
        return out
    }

    /// Serialize composer text: every `@Name` of a picked user becomes the
    /// `@[Name](id)` token the server resolves (longest names first so
    /// "Anna Brandt" isn't clipped by "Anna").
    static func tokenized(_ text: String, users: [UserRef]) -> String {
        var out = text
        for user in users.sorted(by: { $0.name.count > $1.name.count }) {
            let id = user.serverId ?? user.name
            out = out.replacingOccurrences(of: "@\(user.name)", with: "@[\(user.name)](\(id))")
        }
        return out
    }

    /// Plain form for one-line previews: `@[Name](id)` → `@Name`,
    /// `~[SIWEB-15](task:id)` → `SIWEB-15` (web plainifyMentions/plainifyRefs
    /// parity).
    static func flattened(_ text: String) -> String {
        var out = regex.stringByReplacingMatches(
            in: text, range: NSRange(location: 0, length: (text as NSString).length), withTemplate: "@$1"
        )
        out = refRegex.stringByReplacingMatches(
            in: out, range: NSRange(location: 0, length: (out as NSString).length), withTemplate: "$1"
        )
        return out
    }
}
