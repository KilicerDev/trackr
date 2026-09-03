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

    private var sortKey: Binding<TicketSortKey> {
        Binding(get: { filters.sortBy }, set: { filters.setSortKey($0) })
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
                    // Direction arrow sits just left of the dropdown, like the web
                    // panel. Picking a key resets the direction to its natural one.
                    HStack(spacing: 12) {
                        Text("Sort by")
                        Spacer()
                        Button {
                            filters.sortAscending.toggle()
                        } label: {
                            Image(systemName: filters.sortAscending ? "arrow.up" : "arrow.down")
                                .font(.subheadline.weight(.semibold))
                                .frame(width: 28, height: 28)
                                .background(.quaternary, in: RoundedRectangle(cornerRadius: 7))
                        }
                        .buttonStyle(.borderless)
                        .accessibilityLabel(filters.sortAscending ? "Ascending" : "Descending")
                        Picker("Sort by", selection: sortKey) {
                            ForEach(TicketSortKey.allCases) { option in
                                Text(option.label).tag(option)
                            }
                        }
                        .labelsHidden()
                        .fixedSize()
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
                    .disabled(!filters.hasActiveFilters && filters.isDefaultSort)
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
