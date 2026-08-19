//
//  SearchView.swift
//  trackr-mobile-ios
//

import SwiftUI

struct SearchView: View {
    @State private var query = ""

    var body: some View {
        NavigationStack {
            ContentUnavailableView.search(text: query)
                .navigationTitle("Search")
        }
        .searchable(text: $query, prompt: "Tickets, tasks, notes…")
    }
}

#Preview {
    SearchView()
}
