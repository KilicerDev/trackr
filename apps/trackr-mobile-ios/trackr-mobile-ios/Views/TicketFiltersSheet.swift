//
//  TicketFiltersSheet.swift
//  trackr-mobile-ios
//
//  Legacy name kept for existing call sites — the view-options sheet
//  (layout + filters) bound to a filters value, without the saved-views
//  strip (no model here). New code presents `ViewOptionsSheet(model:
//  context: .tickets)` instead.
//

import SwiftUI

struct TicketFiltersSheet: View {
    @Binding var filters: TicketFilters
    /// Filter options are derived from the loaded tickets, like the web
    /// toolbar builds its option lists from page data.
    let tickets: [TicketItem]

    var body: some View {
        ViewOptionsBody(config: .tickets(filters: $filters, tickets: tickets))
    }
}

#Preview {
    @Previewable @State var filters = TicketFilters()
    Color.clear.sheet(isPresented: .constant(true)) {
        TicketFiltersSheet(filters: $filters, tickets: TicketItem.samples)
    }
    .preferredColorScheme(.dark)
}
