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

    @State private var showingFilters = false
    @State private var showingViews = false
    @State private var showingCreate = false
    @State private var collapsedGroups: Set<String> = []

    private var groups: [TicketGroup] { model.ticketFilters.grouped(model.tickets) }

    /// Grouped by org → the org chip on every row is redundant.
    private var showOrg: Bool { model.ticketFilters.group != .org }

    var body: some View {
        NavigationStack(path: $model.ticketPath) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    // Web ListView parity: one section container per group —
                    // header band on top, rows joined by hairline dividers.
                    ForEach(groups) { group in
                        VStack(spacing: 0) {
                            if !group.label.isEmpty {
                                GroupHeader(
                                    label: group.label,
                                    color: group.color,
                                    count: group.tickets.count,
                                    collapsed: collapsedGroups.contains(group.id)
                                ) {
                                    withAnimation(.snappy(duration: 0.25)) {
                                        if !collapsedGroups.insert(group.id).inserted {
                                            collapsedGroups.remove(group.id)
                                        }
                                    }
                                }
                            }
                            if group.label.isEmpty || !collapsedGroups.contains(group.id) {
                                ForEach(Array(group.tickets.enumerated()), id: \.element.id) {
                                    index, ticket in
                                    if index > 0 {
                                        Divider()
                                            .overlay(Color.webBorderStrong)
                                            .padding(.leading, 14)
                                    }
                                    NavigationLink(value: ticket) {
                                        TicketCard(ticket: ticket, embedded: true, showOrg: showOrg)
                                    }
                                    .buttonStyle(.plain)
                                    .ticketContextMenu(for: ticket, model: model)
                                }
                            }
                        }
                        .sectionStyle()
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
            .background(Color.webBackground)
            .refreshable { await model.sync?.refreshTickets() }
            .navigationDestination(for: TicketItem.self) { ticket in
                TicketDetailView(ticket: ticket, model: model)
            }
            .navigationTitle("Tickets")
            .toolbar {
                // Views + filter share one capsule, Apple Music style —
                // same trio as the Tasks tab.
                ToolbarItemGroup(placement: .topBarTrailing) {
                    Button {
                        showingViews = true
                    } label: {
                        Image(systemName: "text.badge.plus")
                    }
                    Button {
                        showingFilters = true
                    } label: {
                        Image(systemName: "line.3.horizontal.decrease")
                    }
                    .tint(model.ticketFilters.hasActiveFilters ? .accentColor : nil)
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
                TicketFiltersSheet(filters: $model.ticketFilters, tickets: model.tickets)
            }
            .sheet(isPresented: $showingViews) {
                SavedViewsSheet(
                    entries: model.savedTicketViews,
                    summary: {
                        TicketFilters(
                            webConfig: $0.config, directories: ViewDirectories(model: model)
                        ).summary
                    },
                    isActive: {
                        TicketFilters(
                            webConfig: $0.config, directories: ViewDirectories(model: model)
                        ) == model.ticketFilters
                    },
                    onApply: { model.sync?.applySavedView(.tickets, entry: $0) },
                    onCreate: { model.sync?.createSavedView(.tickets, name: $0) },
                    onRename: { model.sync?.renameSavedView(.tickets, id: $0.id, to: $1) },
                    onDelete: { model.sync?.deleteSavedView(.tickets, id: $0.id) }
                )
            }
            .sheet(isPresented: $showingCreate) {
                CreateTicketSheet(tickets: model.tickets, model: model) { ticket, files in
                    model.tickets.insert(ticket, at: 0)
                    if let orgId = ticket.org.serverId {
                        let text = ticket.messages.first?.text
                        model.sync?.createTicket(
                            orgId: orgId,
                            subject: ticket.subject,
                            description: text,
                            priority: ticket.priority,
                            category: ticket.category,
                            assignees: ticket.assignees,
                            files: files
                        )
                    }
                }
            }
        }
    }
}

#Preview {
    TicketsView(model: AppModel())
}
