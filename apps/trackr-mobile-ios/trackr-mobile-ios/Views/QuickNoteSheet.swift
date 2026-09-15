//
//  QuickNoteSheet.swift
//  trackr-mobile-ios
//
//  Frictionless quick capture — title plus plain text, exactly the
//  POST /api/v1/notes contract (text becomes simple paragraphs). Sheet
//  chrome: header, bordered title input, big editor card, Cancel / Save.
//

import SwiftUI

struct QuickNoteSheet: View {
    /// Owner of the optimistic note (replaced by server data on refetch).
    var author: UserRef = TaskItem.sampleUsers[0]
    /// Local note for optimistic insert + the raw text for the API (the
    /// server seeds its own HTML from plain text).
    let onCreate: (NoteItem, _ plainText: String) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var text = ""
    @FocusState private var titleFocused: Bool

    private var canSave: Bool { !title.trimmingCharacters(in: .whitespaces).isEmpty }

    var body: some View {
        VStack(spacing: 0) {
            TKSheetHeader(title: "Quick note")
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    TKTextInput(text: $title, placeholder: "Note title")
                        .focused($titleFocused)
                    TKTextArea(text: $text, placeholder: "Start writing…", minHeight: 220)
                    Text("Plain text — each line becomes a paragraph.")
                        .font(.system(size: 11))
                        .foregroundStyle(TK.text4)
                        .padding(.leading, 4)
                }
                .padding(.horizontal, TK.gutter)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            TKSheetFooter(cta: "Save", enabled: canSave, onCancel: { dismiss() }, onConfirm: create)
        }
        .tkSheet()
        .onAppear { titleFocused = true }
    }

    private func create() {
        // Same escaping + paragraph seeding the server does for quick capture.
        let paragraphs = text
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .components(separatedBy: .newlines)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .map { "<p>\(escapeHtml($0))</p>" }
            .joined()
        let note = NoteItem(
            id: "n-\(UUID().uuidString.prefix(8))",
            kind: .quick,
            title: title.trimmingCharacters(in: .whitespaces),
            icon: "doc.text",
            bodyHtml: paragraphs,
            owner: author
        )
        onCreate(note, text.trimmingCharacters(in: .whitespacesAndNewlines))
        dismiss()
    }

    private func escapeHtml(_ s: String) -> String {
        s.replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
            .replacingOccurrences(of: "\"", with: "&quot;")
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        QuickNoteSheet { _, _ in }
    }
    .preferredColorScheme(.dark)
}
