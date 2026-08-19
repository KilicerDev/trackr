//
//  MessageCard.swift
//  trackr-mobile-ios
//
//  Web parity (Inspector comment body): bordered card, not a chat bubble.
//  Reusable for task comments and ticket messages.
//

import SwiftUI

struct MessageCard: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.system(size: 15))
            .lineSpacing(3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 12))
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
            )
    }
}

#Preview {
    MessageCard(text: "Root cause: Outlook inverts any background darker than #333.")
        .padding()
        .background(Color(.systemGroupedBackground))
}
