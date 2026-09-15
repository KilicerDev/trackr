//
//  TKBoard.swift
//  trackr-mobile-ios
//
//  List / Board layout switch and the board itself: a horizontal strip of
//  fixed-width columns that fills the remaining height (so a drag on the
//  empty page area scrolls too); each column scrolls its cards vertically.
//  Used by Tickets (groups), Tasks (groups) and My week (days).
//

import SwiftUI

/// Persisted per page in `@AppStorage("trackr.<page>Layout")`.
enum TKLayout: String, CaseIterable {
    case list, board

    var systemImage: String {
        switch self {
        case .list: "list.bullet"
        case .board: "rectangle.split.3x1"
        }
    }

    var label: String {
        switch self {
        case .list: "List"
        case .board: "Board"
        }
    }
}

/// Icon-only List / Board toggle for list toolbars.
struct TKLayoutSegment: View {
    @Binding var layout: TKLayout

    var body: some View {
        TKSegmented(options: TKLayout.allCases, selection: $layout) { option in
            Image(systemName: option.systemImage)
                .font(.system(size: 13, weight: .medium))
                .frame(width: 14, height: 22)
        }
        .accessibilityLabel("Layout")
    }
}

/// Labeled List / Board toggle bound to an `@AppStorage` key (view options
/// sheet).
struct TKLayoutSegmentRow: View {
    @AppStorage private var raw: String

    init(key: String) {
        _raw = AppStorage(wrappedValue: TKLayout.list.rawValue, key)
    }

    var body: some View {
        TKRow(label: "View") {
            TKSegmented(TKLayout.allCases.map(\.rawValue), selection: $raw, fill: TK.card) {
                TKLayout(rawValue: $0)?.label ?? $0
            }
        }
    }
}

/// Column header: dot · title · mono count, with optional mono trailing.
struct TKBoardColumnHeader: View {
    let title: String
    var color: Color? = nil
    var count: Int? = nil
    var titleColor: Color = TK.text
    var pill: String? = nil
    var subtitle: String? = nil
    var trailing: String? = nil

    var body: some View {
        HStack(spacing: 8) {
            if let color {
                TKDot(color: color)
            }
            Text(title)
                .font(.tkGroup)
                .foregroundStyle(titleColor)
                .lineLimit(1)
            if let subtitle {
                Text(subtitle)
                    .font(.tkMono(12))
                    .foregroundStyle(TK.text3)
            }
            if let pill {
                TKPill(text: pill)
            }
            if let count {
                Text("\(count)")
                    .font(.tkMono(12))
                    .foregroundStyle(TK.text3)
            }
            Spacer(minLength: 0)
            if let trailing {
                Text(trailing)
                    .font(.tkMono(12))
                    .foregroundStyle(TK.text3)
            }
        }
        .padding(.horizontal, 12)
        .frame(height: 40)
        .background(TK.bgRaised, in: .rect(cornerRadius: TK.rChip))
        .overlay(RoundedRectangle(cornerRadius: TK.rChip).strokeBorder(TK.border, lineWidth: 1))
    }
}

/// The board strip. `columns` drive identity; `header`, `cards` and the
/// optional `footer` build each column. Cards are stacked 8pt apart inside
/// a vertical scroll so long columns stay reachable.
struct TKBoard<Column: Identifiable, Header: View, Cards: View, Footer: View>: View {
    let columns: [Column]
    var columnWidth: CGFloat = 250
    /// Column to scroll to on first appearance (the week's today).
    var initialColumn: Column.ID? = nil
    @ViewBuilder var header: (Column) -> Header
    @ViewBuilder var cards: (Column) -> Cards
    @ViewBuilder var footer: (Column) -> Footer

    @State private var position: Column.ID?

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(alignment: .top, spacing: 12) {
                ForEach(columns) { column in
                    VStack(spacing: 8) {
                        header(column)
                        ScrollView(.vertical, showsIndicators: false) {
                            VStack(spacing: 8) {
                                cards(column)
                                footer(column)
                            }
                            .padding(.bottom, 24)
                        }
                        .scrollBounceBehavior(.basedOnSize)
                    }
                    .frame(width: columnWidth)
                    .id(column.id)
                }
            }
            .scrollTargetLayout()
            .padding(.top, 4)
            .frame(maxHeight: .infinity, alignment: .top)
        }
        .contentMargins(.horizontal, TK.gutter, for: .scrollContent)
        // Paging feel: every swipe settles with a column at the leading edge.
        .scrollTargetBehavior(.viewAligned)
        .scrollPosition(id: $position, anchor: .leading)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .onAppear {
            // Anchor deterministically: the layout settles after the shell
            // insets appear, which otherwise leaves a random offset.
            if position == nil { position = initialColumn ?? columns.first?.id }
        }
    }
}

extension TKBoard where Footer == EmptyView {
    init(columns: [Column], columnWidth: CGFloat = 250, initialColumn: Column.ID? = nil,
         @ViewBuilder header: @escaping (Column) -> Header,
         @ViewBuilder cards: @escaping (Column) -> Cards) {
        self.init(columns: columns, columnWidth: columnWidth, initialColumn: initialColumn,
                  header: header, cards: cards) { _ in EmptyView() }
    }
}

/// "+ Add task" ghost row at the bottom of a board column.
struct TKBoardAddButton: View {
    var title = "Add task"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: "plus").font(.system(size: 12, weight: .semibold))
                Text(title).font(.system(size: 13))
                Spacer(minLength: 0)
            }
            .foregroundStyle(TK.text4)
            .padding(.horizontal, 12)
            .frame(height: 40)
            .overlay(
                RoundedRectangle(cornerRadius: TK.rChip)
                    .strokeBorder(TK.borderDashed, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            )
            .contentShape(.rect)
        }
        .buttonStyle(TKPressStyle(radius: TK.rChip))
    }
}
