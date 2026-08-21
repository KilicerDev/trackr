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
    /// Tinted variant, e.g. the ticket internal-note yellow — nil keeps the
    /// standard elevated look.
    var accent: Color?

    var body: some View {
        Text(Mentions.attributed(text))
            .font(.system(size: 15))
            .lineSpacing(3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(
                accent?.opacity(0.10) ?? Color(.secondarySystemGroupedBackground),
                in: .rect(cornerRadius: 12)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .strokeBorder(
                        accent?.opacity(0.30) ?? Color(.separator).opacity(0.4),
                        lineWidth: accent == nil ? 0.5 : 1
                    )
            )
    }
}

#Preview {
    MessageCard(text: "Root cause: Outlook inverts any background darker than #333.")
        .padding()
        .background(Color.webBackground)
}
