//
//  NotesView.swift
//  trackr-mobile-ios
//

import SwiftUI

struct NotesView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Notes",
                systemImage: "note.text",
                description: Text("Wiki, quick notes and meeting notes coming soon.")
            )
            .navigationTitle("Notes")
        }
    }
}

#Preview {
    NotesView()
}
