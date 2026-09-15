//
//  AvatarStack.swift
//  trackr-mobile-ios
//
//  Overlapping avatars for multi-assignee display (first three, like the
//  web's "2 assignees" chip).
//

import SwiftUI

struct AvatarStack: View {
    let users: [UserRef]
    var size: CGFloat = 22

    var body: some View {
        HStack(spacing: -6) {
            ForEach(users.prefix(3), id: \.self) { user in
                AvatarView(user: user, size: size)
                    .overlay(
                        Circle().strokeBorder(TK.card, lineWidth: 2)
                    )
            }
        }
    }
}

#Preview {
    AvatarStack(users: TaskItem.sampleUsers)
        .padding()
}
