//
//  ChecklistCard.swift
//  trackr-mobile-ios
//
//  Shared checklist card for the task/ticket detail views. Self-sizing
//  rows so long item text wraps instead of overflowing — the previous
//  embedded List needed a fixed per-row height for its swipe actions,
//  which clipped multi-line items. Tap toggles, long-press deletes.
//

import SwiftUI

struct ChecklistCard: View {
    @Binding var items: [ChecklistItem]

    @State private var newItem = ""

    var body: some View {
        VStack(spacing: 0) {
            ForEach($items) { $item in
                Button {
                    item.done.toggle()
                } label: {
                    HStack(alignment: .firstTextBaseline, spacing: 10) {
                        Image(systemName: item.done ? "checkmark.square.fill" : "square")
                            .foregroundStyle(
                                item.done ? Color.accentColor : Color(.tertiaryLabel)
                            )
                        Text(item.text)
                            .font(.system(size: 15))
                            .strikethrough(item.done)
                            .foregroundStyle(
                                item.done ? Color(.tertiaryLabel) : Color.primary
                            )
                            .multilineTextAlignment(.leading)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 11)
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .contextMenu {
                    Button {
                        item.done.toggle()
                    } label: {
                        Label(
                            item.done ? "Uncheck" : "Done",
                            systemImage: item.done ? "arrow.uturn.backward" : "checkmark"
                        )
                    }
                    Button(role: .destructive) {
                        items.removeAll { $0.id == item.id }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
                Divider()
                    .padding(.leading, 14)
            }
            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .foregroundStyle(.tertiary)
                TextField("Add an item…", text: $newItem)
                    .font(.system(size: 15))
                    .onSubmit {
                        let text = newItem.trimmingCharacters(in: .whitespaces)
                        guard !text.isEmpty else { return }
                        items.append(ChecklistItem(text: text))
                        newItem = ""
                    }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
        }
        .cardStyle(padded: false)
    }
}

#Preview {
    @Previewable @State var items = [
        ChecklistItem(text: "Reproduce with a test account", done: true),
        ChecklistItem(text: "Check firewall session timeout", done: true),
        ChecklistItem(
            text: "A much longer checklist item that wraps across several "
                + "lines and must never be clipped by a fixed row height"
        ),
        ChecklistItem(text: "Roll out new client config"),
    ]
    ScrollView {
        ChecklistCard(items: $items)
            .padding(16)
    }
    .background(Color.webBackground)
}
