//
//  ChatBubbleRow.swift
//  trackr-mobile-ios
//
//  WhatsApp-style message row shared by ticket conversations, chat threads
//  and task comments: others on the left with their avatar and their name
//  in their color, the signed-in user on the right in the accent tint.
//  `ChatDayPill` is the centered date separator between days.
//

import SwiftUI

struct ChatBubbleRow: View {
    let user: UserRef
    let text: String
    let date: Date
    var attachments: [AttachmentItem] = []
    var pendingFiles: [PickedFile] = []
    /// The signed-in user's own message → right-aligned, no avatar.
    var mine = false
    /// Tinted variant (internal note amber).
    var accent: Color? = nil
    /// Small badge glyph in the top-right corner (lock for internal notes).
    var badge: String? = nil

    var body: some View {
        HStack(alignment: .bottom, spacing: 8) {
            if !mine {
                AvatarView(user: user, size: 28)
            }
            MessageCard(
                text: text,
                accent: accent,
                attachments: attachments,
                pendingFiles: pendingFiles,
                bubble: mine ? .outgoing : .incoming(name: user.name, color: user.color),
                time: date
            )
            .overlay(alignment: .topTrailing) {
                if let badge {
                    Image(systemName: badge)
                        .font(.system(size: 9, weight: .bold))
                        .foregroundStyle(accent ?? TK.text3)
                        .padding(8)
                }
            }
            .frame(maxWidth: 300, alignment: mine ? .trailing : .leading)
        }
        .frame(maxWidth: .infinity, alignment: mine ? .trailing : .leading)
    }
}

/// Centered "Today" / "Yesterday" / date pill.
struct ChatDayPill: View {
    let date: Date

    private var label: String {
        let cal = Calendar.current
        if cal.isDateInToday(date) { return "Today" }
        if cal.isDateInYesterday(date) { return "Yesterday" }
        return date.formatted(.dateTime.day().month(.abbreviated).year())
    }

    var body: some View {
        Text(label)
            .font(.tkMono(11))
            .foregroundStyle(TK.text3)
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(TK.card, in: .capsule)
            .overlay(Capsule().strokeBorder(TK.border, lineWidth: 1))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
    }
}

extension UserRef {
    /// Same person as `me` — by server id when both have one.
    func isSame(as other: UserRef?) -> Bool {
        guard let other else { return false }
        if let a = serverId, let b = other.serverId { return a == b }
        return self == other
    }
}
