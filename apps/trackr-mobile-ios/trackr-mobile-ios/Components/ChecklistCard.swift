//
//  ChecklistCard.swift
//  trackr-mobile-ios
//
//  Shared checklist card for the task/ticket detail views: 48pt rows with
//  the prototype's TKCheckBox, hairline-separated, "+ Add an item…" input
//  as the last row. Self-sizing rows so long item text wraps. Tap toggles,
//  long-press deletes.
//

import SwiftUI

struct ChecklistCard: View {
    @Binding var items: [ChecklistItem]

    @State private var newItem = ""

    var body: some View {
        VStack(spacing: 0) {
            ForEach($items) { $item in
                Button {
                    withAnimation(.easeOut(duration: 0.15)) { item.done.toggle() }
                } label: {
                    HStack(alignment: .top, spacing: 12) {
                        TKCheckBox(done: item.done)
                            .padding(.top, 1)
                        Text(item.text)
                            .font(.tkRow)
                            .strikethrough(item.done, color: TK.text4)
                            .foregroundStyle(item.done ? TK.text3 : TK.text)
                            .multilineTextAlignment(.leading)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                    .frame(minHeight: 48)
                    .contentShape(.rect)
                }
                .buttonStyle(TKPressStyle())
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
                TKHairline()
            }
            HStack(spacing: 12) {
                Image(systemName: "plus")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(TK.text4)
                    .frame(width: 22)
                TextField("", text: $newItem, prompt: Text("Add an item…").foregroundStyle(TK.text4))
                    .font(.tkRow)
                    .foregroundStyle(TK.text)
                    .onSubmit {
                        let text = newItem.trimmingCharacters(in: .whitespaces)
                        guard !text.isEmpty else { return }
                        items.append(ChecklistItem(text: text))
                        newItem = ""
                    }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
        }
        .tkCard(radius: TK.rCardSm, padding: nil)
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
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
