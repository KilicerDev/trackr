//
//  NewThreadSheet.swift
//  trackr-mobile-ios
//
//  New chat thread in the active org: title, message, tags — the web
//  feed's always-open composer as a native sheet.
//

import SwiftUI

struct NewThreadSheet: View {
    let org: OrgRef
    var availableTags: [ChatTag] = ChatThread.sampleTags
    let onCreate: (ChatThread) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var body_ = ""
    @State private var tags: Set<ChatTag> = []

    private var canCreate: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty
            && !body_.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("What's it about?", text: $title)
                        .font(.system(size: 20, weight: .semibold))
                    TextField("Write your message…", text: $body_, axis: .vertical)
                        .lineLimit(5...12)
                        .font(.system(size: 15))
                }

                Section("Tags") {
                    MultiSelectRow(
                        title: "Tags",
                        options: availableTags.map { ($0, $0.label) },
                        selection: $tags
                    )
                }

                Section {
                    LabeledContent("Organization") {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(org.color)
                                .frame(width: 8, height: 8)
                            Text(org.name)
                        }
                    }
                }
            }
            .navigationTitle("New Thread")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Post") { create() }
                        .fontWeight(.semibold)
                        .disabled(!canCreate)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }

    private func create() {
        let me = TaskItem.sampleUsers[0]  // replaced by server data on refetch
        let thread = ChatThread(
            id: "th-\(UUID().uuidString.prefix(8))",
            org: org,
            title: title.trimmingCharacters(in: .whitespaces),
            tags: Array(tags),
            messages: [
                ChatMessageItem(
                    user: me, date: .now,
                    text: body_.trimmingCharacters(in: .whitespacesAndNewlines)
                ),
            ]
        )
        onCreate(thread)
        dismiss()
    }
}

#Preview {
    Color.clear.sheet(isPresented: .constant(true)) {
        NewThreadSheet(org: TicketItem.sampleOrgs[0]) { _ in }
    }
}
