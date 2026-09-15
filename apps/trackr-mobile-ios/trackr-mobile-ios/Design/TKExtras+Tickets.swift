//
//  TKExtras+Tickets.swift
//  trackr-mobile-ios
//
//  Kit additions made for the tickets package (candidates for the shared
//  kit): a multi-select variant of TKPickerSheet — same chrome and rows,
//  but `selected` is a set and every tap toggles without dismissing.
//

import SwiftUI

#Preview("Multi picker") {
    Color.clear.sheet(isPresented: .constant(true)) {
        TKMultiPickerSheet(
            title: "Assignees",
            options: TaskItem.sampleUsers.map { user in
                TKPickerOption(user, label: user.name) { TKPickerIcon.avatar(user) }
            },
            selected: [TaskItem.sampleUsers[0]],
            searchable: true
        ) { _ in }
    }
    .preferredColorScheme(.dark)
}
