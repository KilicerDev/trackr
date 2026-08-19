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
        HStack(spacing: -size * 0.32) {
            ForEach(users.prefix(3), id: \.self) { user in
                AvatarView(user: user, size: size)
                    .overlay(
                        Circle().strokeBorder(
                            Color(.secondarySystemGroupedBackground),
                            lineWidth: 1.5
                        )
                    )
            }
        }
    }
}

#Preview {
    AvatarStack(users: TaskItem.sampleUsers)
        .padding()
}
