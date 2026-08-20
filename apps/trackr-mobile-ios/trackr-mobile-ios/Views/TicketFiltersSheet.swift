//
//  TicketFiltersSheet.swift
//  trackr-mobile-ios
//

import SwiftUI

struct TicketFiltersSheet: View {
    @Binding var filters: TicketFilters
    /// Filter options are derived from the loaded tickets, like the web
    /// toolbar builds its option lists from page data.
    let tickets: [TicketItem]
    @Environment(\.dismiss) private var dismiss

    private var orgOptions: [(value: OrgRef, label: String)] {
        Array(Set(tickets.map(\.org)))
            .sorted { $0.name < $1.name }
            .map { ($0, $0.name) }
    }

    private var assigneeOptions: [(value: UserRef, label: String)] {
        Array(Set(tickets.flatMap(\.assignees)))
            .sorted { $0.name < $1.name }
            .map { ($0, $0.name) }
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("View") {
                    Picker("Group by", selection: $filters.group) {
                        ForEach(TicketGroupBy.allCases) { option in
                            Text(option.label).tag(option)
                        }
                    }
                }

                Section("Filter by") {
                    MultiSelectRow(
                        title: "Status",
                        options: TicketStatus.allCases.map { ($0, $0.label) },
                        selection: $filters.statuses
                    )
                    MultiSelectRow(
                        title: "Priority",
                        options: TaskPriority.ticketCases.map { ($0, $0.label) },
                        selection: $filters.priorities
                    )
                    MultiSelectRow(
                        title: "Category",
                        options: TicketCategory.allCases.map { ($0, $0.label) },
                        selection: $filters.categories
                    )
                    MultiSelectRow(
                        title: "Organization",
                        options: orgOptions,
                        selection: $filters.orgs
                    )
                    MultiSelectRow(
                        title: "Assignee",
                        options: assigneeOptions,
                        selection: $filters.assignees
                    )
                }
            }
            .navigationTitle("Filters")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Reset") {
                        filters.reset()
                    }
                    .disabled(!filters.hasActiveFilters)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                        .fontWeight(.semibold)
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

#Preview {
    @Previewable @State var filters = TicketFilters()
    Color.clear.sheet(isPresented: .constant(true)) {
        TicketFiltersSheet(filters: $filters, tickets: TicketItem.samples)
    }
}
