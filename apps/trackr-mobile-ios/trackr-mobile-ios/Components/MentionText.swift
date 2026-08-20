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
    static func attributed(_ text: String) -> AttributedString {
        var out = AttributedString()
        let ns = text as NSString
        var cursor = 0
        for match in regex.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            if match.range.location > cursor {
                out += AttributedString(
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
