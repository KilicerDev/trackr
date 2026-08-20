//
//  TicketsView.swift
//  trackr-mobile-ios
//
//  Ticket cards with the web toolbar's group-by / filters behind a native
//  filter sheet — the same recipe as TasksView, tickets flavor.
//

import SwiftUI

struct TicketsView: View {
    @Bindable var model: AppModel

    @State private var filters = TicketFilters()
    @State private var showingFilters = false
    @State private var showingCreate = false

    private var groups: [TicketGroup] { filters.grouped(model.tickets) }

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    ForEach(groups) { group in
                        if !group.label.isEmpty {
                            GroupHeader(label: group.label, color: group.color,
                                        count: group.tickets.count)
                                .padding(.top, 14)
                                .padding(.leading, 4)
                        }
                        ForEach(group.tickets) { ticket in
                            NavigationLink(value: ticket) {
                                TicketCard(ticket: ticket)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    if groups.allSatisfy(\.tickets.isEmpty) {
                        ContentUnavailableView(
                            "No matching tickets",
                            systemImage: "line.3.horizontal.decrease",
                            description: Text("Try removing some filters.")
                        )
                        .padding(.top, 60)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
            .background(Color(.systemGroupedBackground))
            .refreshable { await model.sync?.refreshTickets() }
            .navigationDestination(for: TicketItem.self) { ticket in
                TicketDetailView(ticket: ticket, model: model)
            }
            .navigationTitle("Tickets")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingFilters = true
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease")
                    }
                    .tint(filters.hasActiveFilters ? .accentColor : nil)
                }
                ToolbarSpacer(.fixed, placement: .topBarTrailing)
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        showingCreate = true
                    } label: {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showingFilters) {
                TicketFiltersSheet(filters: $filters, tickets: model.tickets)
            }
            .sheet(isPresented: $showingCreate) {
                CreateTicketSheet(tickets: model.tickets, model: model) { ticket in
                    model.tickets.insert(ticket, at: 0)
                    if let orgId = ticket.org.serverId {
                        let text = ticket.messages.first?.text
                        model.sync?.createTicket(
                            orgId: orgId,
                            subject: ticket.subject,
                            description: text,
                            assignees: ticket.assignees
                        )
                    }
                }
            }
        }
    }
}

private struct GroupHeader: View {
    let label: String
    let color: Color?
    let count: Int

    var body: some View {
        HStack(spacing: 7) {
            if let color {
                Circle()
                    .fill(color)
                    .frame(width: 8, height: 8)
            }
            Text(label)
                .font(.system(size: 13, weight: .semibold))
            Text("\(count)")
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(.tertiary)
        }
    }
}

#Preview {
    TicketsView(model: AppModel())
}
