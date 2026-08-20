//
//  QuickNoteSheet.swift
//  trackr-mobile-ios
//
//  Frictionless quick capture — title plus plain text, exactly the
//  POST /api/v1/notes contract (text becomes simple paragraphs).
//

import SwiftUI

struct QuickNoteSheet: View {
    let onCreate: (NoteItem) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var text = ""
    @FocusState private var titleFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Note title", text: $title)
                        .font(.system(size: 20, weight: .semibold))
                        .focused($titleFocused)
                    TextField("Start writing…", text: $text, axis: .vertical)
                        .lineLimit(6...16)
                        .font(.system(size: 15))
                }
            }
            .navigationTitle("Quick Note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Create") { create() }
                        .fontWeight(.semibold)
                        .disabled(title.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            .onAppear { titleFocused = true }
        }
        .presentationDetents([.medium, .large])
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
            owner: TaskItem.sampleUsers[0]  // current user later
        )
        onCreate(note)
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
        QuickNoteSheet { _ in }
    }
}
