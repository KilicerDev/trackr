//
//  MessageComposer.swift
//  trackr-mobile-ios
//
//  Bottom composer: growing text field with attach + send. Reusable for
//  task comments, ticket replies, and chat.
//

import SwiftUI

struct MessageComposer: View {
    /// Serialized body — `@Name` picks become `@[Name](id)` mention tokens
    /// (web Composer parity). Setting it to "" from outside resets the field.
    @Binding var text: String
    var placeholder = "Write a comment…"
    /// People offered when the user types `@…`; empty disables mentions.
    var mentionCandidates: [UserRef] = []
    var onAttach: (() -> Void)?
    let onSend: () -> Void

    /// What the user sees and edits — plain `@Name` runs.
    @State private var display = ""
    @State private var picked: [UserRef] = []

    private static let queryRegex = try! NSRegularExpression(pattern: "(?:^|\\s)@([^@\\s]*)$")

    private var isEmpty: Bool {
        display.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    /// The `@query` being typed at the caret (end of text), if any.
    private var mentionQuery: (range: NSRange, query: String)? {
        let ns = display as NSString
        guard let match = Self.queryRegex.firstMatch(in: display, range: NSRange(location: 0, length: ns.length))
        else { return nil }
        let q = match.range(at: 1)
        // Range of "@query" (excluding the leading whitespace).
        return (NSRange(location: q.location - 1, length: q.length + 1), ns.substring(with: q))
    }

    private var suggestions: [UserRef] {
        guard !mentionCandidates.isEmpty, let query = mentionQuery?.query else { return [] }
        var seen = Set<String>()
        return mentionCandidates
            .filter { seen.insert($0.name).inserted }
            .filter { query.isEmpty || $0.name.localizedCaseInsensitiveContains(query) }
            .prefix(8)
            .map { $0 }
    }

    var body: some View {
        VStack(spacing: 6) {
            if !suggestions.isEmpty {
                suggestionStrip
            }
            field
        }
        // Match the tab bar cluster's horizontal inset below it.
        .padding(.horizontal, 20)
        .padding(.bottom, 6)
        .onChange(of: display) { _, new in
            picked.removeAll { !new.contains("@\($0.name)") }
            text = Mentions.tokenized(new, users: picked)
        }
        .onChange(of: text) { _, new in
            // External reset (caller cleared the draft after sending).
            if new.isEmpty, !display.isEmpty {
                display = ""
                picked = []
            }
        }
        .animation(.easeOut(duration: 0.15), value: suggestions.map(\.name))
    }

    private var suggestionStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(suggestions, id: \.name) { user in
                    Button {
                        insert(user)
                    } label: {
                        HStack(spacing: 6) {
                            AvatarView(user: user, size: 20)
                            Text(user.name)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundStyle(.primary)
                        }
                        .padding(.leading, 4)
                        .padding(.trailing, 10)
                        .frame(height: 30)
                        .background(.ultraThinMaterial, in: .capsule)
                        .overlay(Capsule().strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5))
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 2)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    private func insert(_ user: UserRef) {
        guard let range = mentionQuery?.range else { return }
        let ns = display as NSString
        display = ns.replacingCharacters(in: range, with: "@\(user.name) ")
        if !picked.contains(user) { picked.append(user) }
    }

    private var field: some View {
        HStack(alignment: .bottom, spacing: 10) {
            if let onAttach {
                Button(action: onAttach) {
                    Image(systemName: "paperclip")
                        .font(.system(size: 17))
                        .foregroundStyle(Color(.secondaryLabel))
                        .frame(width: 34, height: 34)
                }
            }

            TextField(placeholder, text: $display, axis: .vertical)
                .font(.system(size: 15))
                .lineLimit(1...5)
                .padding(.horizontal, 4)
                .padding(.vertical, 7)

            Button(action: onSend) {
                Image(systemName: "arrow.up.circle.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(isEmpty ? Color(.tertiaryLabel) : Color.accentColor)
            }
            .disabled(isEmpty)
            .padding(.bottom, 3)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(.ultraThinMaterial, in: .rect(cornerRadius: 22))
        .overlay(
            RoundedRectangle(cornerRadius: 22)
                .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
        )
    }
}

#Preview {
    @Previewable @State var text = ""
    VStack {
        Spacer()
        MessageComposer(text: $text, onAttach: {}) {}
    }
    .background(Color.webBackground)
}
