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
    @State private var showingViews = false
    @State private var collapsedGroups: Set<String> = []

    private var layout: Binding<TKLayout> {
        Binding(
            get: { TKLayout(rawValue: layoutRaw) ?? .list },
            set: { layoutRaw = $0.rawValue }
        )
    }

    private var groups: [TicketGroup] { model.ticketFilters.grouped(model.tickets) }

    private var isEmpty: Bool { groups.allSatisfy(\.tickets.isEmpty) }

    private var openCount: Int { model.tickets.count { !$0.status.isClosed } }

    /// Grouped by org → the org on every row is redundant.
    private var showOrg: Bool { model.ticketFilters.group != .org }

    /// Name of the saved view whose config equals the current filters.
    private var currentViewName: String {
        let directories = ViewDirectories(model: model)
        let match = model.savedTicketViews.first {
            TicketFilters(webConfig: $0.config, directories: directories) == model.ticketFilters
        }
        return match?.name ?? "Custom view"
    }

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
                        TKPageHeader("Tickets", meta: "\(openCount) open")
                        toolbarRow
                        board
                    }
                } else {
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 0) {
                            TKPageHeader("Tickets", meta: "\(openCount) open")
                            toolbarRow
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
            .sheet(isPresented: $showingViews) {
                ViewOptionsSheet(model: model, context: .tickets)
            }
        }
    }

    // MARK: - Toolbar

    private var toolbarRow: some View {
        HStack(spacing: 8) {
            TKViewChip(name: currentViewName) { showingViews = true }
                .frame(maxWidth: 220, alignment: .leading)
            Spacer(minLength: 4)
            TKLayoutSegment(layout: layout)
            TKFilterButton(count: filterCount) { showingFilters = true }
        }
        .padding(.horizontal, TK.gutter)
        .padding(.top, 8)
        .padding(.bottom, 12)
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
