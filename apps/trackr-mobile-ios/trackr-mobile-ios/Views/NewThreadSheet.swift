//
//  NewThreadSheet.swift
//  trackr-mobile-ios
//
//  New chat thread in the active org: title, message, tags — the web
//  feed's always-open composer as a prototype sheet (header, bordered
//  inputs, tag chips + dashed "+ Tags" opening a multi-select picker,
//  Cancel / Post footer).
//

import SwiftUI

struct NewThreadSheet: View {
    let org: OrgRef
    var availableTags: [ChatTag] = ChatThread.sampleTags
    /// Author of the optimistic root message (replaced by server data on
    /// refetch).
    var author: UserRef = TaskItem.sampleUsers[0]
    let onCreate: (ChatThread) -> Void
    @Environment(\.dismiss) private var dismiss

    @State private var title = ""
    @State private var body_ = ""
    @State private var tags: [ChatTag] = []
    @State private var showingTags = false

    private var canCreate: Bool {
        !title.trimmingCharacters(in: .whitespaces).isEmpty
            && !body_.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        VStack(spacing: 0) {
            TKSheetHeader(title: "New thread")
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(spacing: 6) {
                        Text("in")
                            .font(.system(size: 13))
                            .foregroundStyle(TK.text3)
                        TKDot(color: org.color)
                        Text(org.name)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(TK.text2)
                    }
                    TKTextInput(text: $title, placeholder: "What's it about?")
                    TKTextArea(text: $body_, placeholder: "Write your message…", minHeight: 150)
                    TKSectionLabel("Tags")
                        .padding(.top, 4)
                    ChipFlow(spacing: 8) {
                        ForEach(tags, id: \.self) { tag in
                            Button {
                                tags.removeAll { $0 == tag }
                            } label: {
                                PropertyChip(style: .filled) {
                                    TKDot(color: tag.color, size: 6)
                                    Text(tag.label)
                                    Image(systemName: "xmark")
                                        .font(.system(size: 9, weight: .bold))
                                        .foregroundStyle(TK.text4)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                        TKDashedChip(title: tags.isEmpty ? "Tags" : "Add") { showingTags = true }
                    }
                }
                .padding(.horizontal, TK.gutter)
                .padding(.top, 16)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            TKSheetFooter(cta: "Post", enabled: canCreate, onCancel: { dismiss() }, onConfirm: create)
        }
        .tkSheet()
        .sheet(isPresented: $showingTags) {
            TKPickerSheet(
                title: "Tags",
                options: availableTags.map { tag in
                    TKPickerOption(tag, label: tag.label) {
                        HStack(spacing: 8) {
                            TKCheckCircle(done: tags.contains(tag), size: 18)
                            TKDot(color: tag.color)
                        }
                    }
                },
                selected: nil,
                dismissOnPick: false
            ) { tag in
                if let index = tags.firstIndex(of: tag) {
                    tags.remove(at: index)
                } else {
                    tags.append(tag)
                }
            }
        }
    }

    private func create() {
        let thread = ChatThread(
            id: "th-\(UUID().uuidString.prefix(8))",
            org: org,
            title: title.trimmingCharacters(in: .whitespaces),
            tags: tags,
            messages: [
                ChatMessageItem(
                    user: author, date: .now,
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
    .preferredColorScheme(.dark)
}
