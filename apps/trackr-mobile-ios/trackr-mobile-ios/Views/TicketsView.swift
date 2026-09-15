//
//  TicketsView.swift
//  trackr-mobile-ios
//
//  Root surface of the Tickets tab: page header, view chip / List-Board /
//  filter toolbar, then either the flat grouped list (bands + hairline
//  rows) or the horizontal board. Grouping and filters come from
//  `model.ticketFilters`; the saved-view and filter sheets are shared.
//

import SwiftUI

struct TicketsView: View {
    @Bindable var model: AppModel

    @AppStorage("trackr.ticketsLayout") private var layoutRaw = TKLayout.list.rawValue
    @State private var showingFilters = false
    @State private var collapsedGroups: Set<String> = []

    private var layout: Binding<TKLayout> {
        Binding(
            get: { TKLayout(rawValue: layoutRaw) ?? .list },
            set: { layoutRaw = $0.rawValue }
        )
    }

    private var groups: [TicketGroup] { model.ticketFilters.grouped(model.tickets) }

    private var isEmpty: Bool { groups.allSatisfy(\.tickets.isEmpty) }


    /// Grouped by org → the org on every row is redundant.
    private var showOrg: Bool { model.ticketFilters.group != .org }


    /// Active filter dimensions — the badge on the Filter button.
    private var filterCount: Int {
        let f = model.ticketFilters
        return [!f.statuses.isEmpty, !f.priorities.isEmpty, !f.categories.isEmpty,
                !f.orgs.isEmpty, !f.assignees.isEmpty].count { $0 }
    }

    var body: some View {
        NavigationStack(path: $model.ticketPath) {
            Group {
                if layout.wrappedValue == .board && !isEmpty {
                    VStack(spacing: 0) {
                        pageHeader
                        board
                    }
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            pageHeader
                            if isEmpty {
                                TKEmptyState(
                                    text: model.tickets.isEmpty
                                        ? "No tickets yet." : "No tickets match these filters."
                                )
                            } else {
                                list
                            }
                        }
                        .padding(.bottom, 24)
                    }
                    .refreshable { await model.sync?.refreshTickets() }
                }
            }
            .tkRootScreen(model)
            .navigationDestination(for: TicketItem.self) { ticket in
                TicketDetailView(ticket: ticket, model: model)
                    .tkDetailScreen()
            }
            .sheet(isPresented: $showingFilters) {
                ViewOptionsSheet(model: model, context: .tickets)
            }
        }
    }

    // MARK: - Toolbar

    /// Header: title + Filter (saved views and List/Board live inside the
    /// view options sheet).
    private var pageHeader: some View {
        TKPageHeader("Tickets") {
            TKFilterButton(count: filterCount) { showingFilters = true }
        }
        .padding(.bottom, 10)
    }

    // MARK: - List

    @ViewBuilder
    private var list: some View {
        ForEach(groups) { group in
            let collapsed = collapsedGroups.contains(group.id)
            if !group.label.isEmpty {
                TKGroupBand(
                    title: group.label,
                    color: group.color,
                    count: group.tickets.count,
                    collapsible: true,
                    collapsed: collapsed
                ) {
                    withAnimation(.snappy(duration: 0.2)) {
                        if !collapsedGroups.insert(group.id).inserted {
                            collapsedGroups.remove(group.id)
                        }
                    }
                }
            }
            if group.label.isEmpty || !collapsed {
                ForEach(group.tickets) { ticket in
                    TKHairline()
                    NavigationLink(value: ticket) {
                        TicketRow(ticket: ticket, showOrg: showOrg)
                    }
                    .buttonStyle(TKPressStyle())
                    .ticketContextMenu(for: ticket, model: model)
                }
            }
        }
        TKHairline()
    }

    // MARK: - Board

    private var board: some View {
        TKBoard(columns: groups) { group in
            TKBoardColumnHeader(
                title: group.label.isEmpty ? "All tickets" : group.label,
                color: group.color,
                count: group.tickets.count
            )
        } cards: { group in
            ForEach(group.tickets) { ticket in
                NavigationLink(value: ticket) {
                    TicketBoardCard(ticket: ticket)
                }
                .buttonStyle(TKScaleStyle())
                .ticketContextMenu(for: ticket, model: model)
            }
        }
    }
}

#Preview {
    TicketsView(model: AppModel())
        .preferredColorScheme(.dark)
}
