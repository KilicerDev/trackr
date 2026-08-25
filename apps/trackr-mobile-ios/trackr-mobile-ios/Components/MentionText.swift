//
//  MentionText.swift
//  trackr-mobile-ios
//
//  @-mention rendering. Comment/message bodies store mentions as
//  `@[Display Name](userId)` tokens (web utils/mentions.ts) — render them
//  as accent-tinted `@Name` runs instead of showing the raw token.
//

import SwiftUI

enum Mentions {
    /// `@[Name](id)` — capture 1 = display name, capture 2 = user id.
    static let regex = try! NSRegularExpression(pattern: "@\\[([^\\]]+)\\]\\(([^)]+)\\)")

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
        var cursor = 0
        for match in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            if match.range.location > cursor {
                out += linkified(
                    ns.substring(with: NSRange(location: cursor, length: match.range.location - cursor))
                )
            }
            let name = ns.substring(with: match.range(at: 1))
            var mention = AttributedString("@\(name)")
            mention.foregroundColor = .accentColor
            mention.inlinePresentationIntent = .stronglyEmphasized
            out += mention
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

    /// Plain form for one-line previews: `@[Name](id)` → `@Name`
    /// (web plainifyMentions parity).
    static func flattened(_ text: String) -> String {
        let ns = text as NSString
        return regex.stringByReplacingMatches(
            in: text, range: NSRange(location: 0, length: ns.length), withTemplate: "@$1"
        )
    }
}
