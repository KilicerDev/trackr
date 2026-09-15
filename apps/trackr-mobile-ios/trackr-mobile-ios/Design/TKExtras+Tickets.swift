//
//  TKExtras+Tickets.swift
//  trackr-mobile-ios
//
//  Kit additions made for the tickets package (candidates for the shared
//  kit): a multi-select variant of TKPickerSheet — same chrome and rows,
//  but `selected` is a set and every tap toggles without dismissing.
//

import SwiftUI

/// `TKPickerSheet` for multi-select fields (assignees): checks on every
/// selected row, tap toggles, the sheet stays open.
struct TKMultiPickerSheet<Value: Hashable>: View {
    let title: String
    let options: [TKPickerOption<Value>]
    var selected: Set<Value>
    var searchable = false
    var searchPlaceholder = "Search…"
    let onToggle: (Value) -> Void

    @State private var query = ""

    private var filtered: [TKPickerOption<Value>] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return options }
        return options.filter { $0.label.localizedCaseInsensitiveContains(q) }
    }

    private var detent: PresentationDetent {
        let rows = CGFloat(min(options.count, 9))
        let extra: CGFloat = searchable ? 54 : 0
        return .height(min(UIScreen.main.bounds.height * 0.8, 120 + extra + rows * 50))
    }

    var body: some View {
        VStack(spacing: 12) {
            TKSheetHeader(title: title, badge: selected.count)
            if searchable {
                TKSearchField(text: $query, placeholder: searchPlaceholder, height: 42)
                    .padding(.horizontal, TK.gutter)
            }
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(filtered) { option in
                        let isOn = selected.contains(option.value)
                        Button {
                            onToggle(option.value)
                        } label: {
                            HStack(spacing: 12) {
                                if let icon = option.icon {
                                    icon.frame(width: 26)
                                }
                                Text(option.label)
                                    .font(.system(size: 16))
                                    .foregroundStyle(TK.text)
                                    .lineLimit(1)
                                Spacer()
                                Image(systemName: "checkmark")
                                    .font(.system(size: 13, weight: .bold))
                                    .foregroundStyle(TK.accent)
                                    .opacity(isOn ? 1 : 0)
                            }
                            .padding(.horizontal, 14)
                            .frame(minHeight: 50)
                            .contentShape(.rect)
                        }
                        .buttonStyle(TKPressStyle())
                        if option.id != filtered.last?.id {
                            TKHairline(color: TK.hairlineStrong)
                        }
                    }
                    if filtered.isEmpty {
                        TKEmptyState(text: "No matches", padding: 24)
                    }
                }
                .background(TK.bg, in: .rect(cornerRadius: TK.rCardSm))
                .overlay(RoundedRectangle(cornerRadius: TK.rCardSm).strokeBorder(TK.border, lineWidth: 1))
                .padding(.horizontal, TK.gutter)
                .padding(.bottom, 24)
            }
        }
        .tkSheet(detents: [detent, .large])
    }
}

#Preview("Multi picker") {
    Color.clear.sheet(isPresented: .constant(true)) {
        TKMultiPickerSheet(
            title: "Assignees",
            options: TaskItem.sampleUsers.map { user in
                TKPickerOption(user, label: user.name) { TKPickerIcon.avatar(user) }
            },
            selected: [TaskItem.sampleUsers[0]],
            searchable: true
        ) { _ in }
    }
    .preferredColorScheme(.dark)
}
