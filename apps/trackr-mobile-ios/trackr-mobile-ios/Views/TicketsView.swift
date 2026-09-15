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

enum TicketsLayout: String, CaseIterable {
    case list, board

    var systemImage: String {
        switch self {
        case .list: "list.bullet"
        case .board: "rectangle.split.3x1"
        }
    }
}

struct TicketsView: View {
    @Bindable var model: AppModel

    @AppStorage("trackr.ticketsLayout") private var layoutRaw = TicketsLayout.list.rawValue
    @State private var showingFilters = false
    @State private var showingViews = false
    @State private var collapsedGroups: Set<String> = []

    private var layout: Binding<TicketsLayout> {
        Binding(
            get: { TicketsLayout(rawValue: layoutRaw) ?? .list },
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
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    TKPageHeader("Tickets", meta: "\(openCount) open")
                    toolbarRow
                    if isEmpty {
                        TKEmptyState(
                            text: model.tickets.isEmpty
                                ? "No tickets yet." : "No tickets match these filters."
                        )
                    } else if layout.wrappedValue == .list {
                        list
                    } else {
                        board
                    }
                }
                .padding(.bottom, 24)
            }
            .refreshable { await model.sync?.refreshTickets() }
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
            TKSegmented(options: TicketsLayout.allCases, selection: layout) { option in
                Image(systemName: option.systemImage)
                    .font(.system(size: 13, weight: .medium))
                    .frame(width: 14, height: 22)
            }
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
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 12) {
                ForEach(groups) { group in
                    boardColumn(group)
                }
            }
            .padding(.horizontal, TK.gutter)
            .padding(.top, 4)
        }
    }

    private func boardColumn(_ group: TicketGroup) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
                if let color = group.color {
                    TKDot(color: color)
                }
                Text(group.label.isEmpty ? "All tickets" : group.label)
                    .font(.tkGroup)
                    .foregroundStyle(TK.text)
                    .lineLimit(1)
                Text("\(group.tickets.count)")
                    .font(.tkMono(12))
                    .foregroundStyle(TK.text3)
                Spacer(minLength: 0)
            }
            .padding(.horizontal, 12)
            .frame(height: 40)
            .background(TK.bgRaised, in: .rect(cornerRadius: TK.rChip))
            .overlay(RoundedRectangle(cornerRadius: TK.rChip).strokeBorder(TK.border, lineWidth: 1))

            ForEach(group.tickets) { ticket in
                NavigationLink(value: ticket) {
                    TicketBoardCard(ticket: ticket)
                }
                .buttonStyle(TKScaleStyle())
                .ticketContextMenu(for: ticket, model: model)
            }
        }
        .frame(width: 250)
    }
}

#Preview {
    TicketsView(model: AppModel())
        .preferredColorScheme(.dark)
}
