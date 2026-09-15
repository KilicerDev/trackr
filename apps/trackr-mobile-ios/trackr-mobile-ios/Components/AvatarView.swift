//
//  AvatarView.swift
//  trackr-mobile-ios
//
//  Web parity (components/Avatar.svelte): initials on the user's color,
//  gray "?" placeholder when unassigned.
//

import SwiftUI

struct AvatarView: View {
    let user: UserRef?
    var size: CGFloat = 24

    var body: some View {
        Group {
            if let user {
                Text(user.initials)
                    .font(.system(size: max(9, size * 0.4), weight: .semibold))
                    .foregroundStyle(.white)
                    .frame(width: size, height: size)
                    .background(user.color, in: .circle)
                    .accessibilityLabel(user.name)
            } else {
                Text("?")
                    .font(.system(size: max(9, size * 0.45)))
                    .foregroundStyle(TK.text2)
                    .frame(width: size, height: size)
                    .background(TK.elevated2, in: .circle)
                    .accessibilityLabel("Unassigned")
            }
        }
    }
}

#Preview {
    HStack(spacing: 10) {
        AvatarView(user: TaskItem.sampleUsers.first)
        AvatarView(user: nil)
    }
    .padding()
}
