//
//  MessageComposer.swift
//  trackr-mobile-ios
//
//  Bottom composer: growing text field with attach + send. Reusable for
//  task comments, ticket replies, and chat.
//

import SwiftUI

struct MessageComposer: View {
    @Binding var text: String
    var placeholder = "Write a comment…"
    var onAttach: (() -> Void)?
    let onSend: () -> Void

    private var isEmpty: Bool {
        text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var body: some View {
        HStack(alignment: .bottom, spacing: 10) {
            if let onAttach {
                Button(action: onAttach) {
                    Image(systemName: "paperclip")
                        .font(.system(size: 17))
                        .foregroundStyle(Color(.secondaryLabel))
                        .frame(width: 34, height: 34)
                }
            }

            TextField(placeholder, text: $text, axis: .vertical)
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
        // Match the tab bar cluster's horizontal inset below it.
        .padding(.horizontal, 20)
        .padding(.bottom, 6)
    }
}

#Preview {
    @Previewable @State var text = ""
    VStack {
        Spacer()
        MessageComposer(text: $text, onAttach: {}) {}
    }
    .background(Color(.systemGroupedBackground))
}
