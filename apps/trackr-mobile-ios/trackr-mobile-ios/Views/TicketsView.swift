//
//  TicketsView.swift
//  trackr-mobile-ios
//

import SwiftUI

struct TicketsView: View {
    var body: some View {
        NavigationStack {
            ContentUnavailableView(
                "Tickets",
                systemImage: "ticket",
                description: Text("Ticket list coming soon.")
            )
            .navigationTitle("Tickets")
        }
    }
}

#Preview {
    TicketsView()
}
