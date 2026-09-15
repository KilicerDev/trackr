//
//  TKSheets.swift
//  trackr-mobile-ios
//
//  Bottom-sheet chrome (drag handle, title, close), the generic option
//  picker sheet (list + searchable), the date picker sheet (month grid +
//  quick buttons) and the toast — the prototype's overlay vocabulary.
//

import SwiftUI

// MARK: - Sheet chrome

extension View {
    /// Prototype sheet look: 28pt top radius, card background, no system
    /// drag indicator (the header draws its own handle).
    func tkSheet(background: Color = TK.card,
                 detents: Set<PresentationDetent> = [.large]) -> some View {
        self
            .presentationDetents(detents)
            .presentationDragIndicator(.hidden)
            .presentationCornerRadius(TK.rSheet)
            .presentationBackground(background)
    }
}

/// Handle + 17pt semibold title (+ optional badge) + round close button.
struct TKSheetHeader: View {
    let title: String
    var badge: Int? = nil
    var onClose: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(spacing: 12) {
            TKSheetHandle()
            HStack(spacing: 8) {
                Text(title)
                    .font(.tkSheetTitle)
                    .foregroundStyle(TK.text)
                if let badge, badge > 0 {
                    TKCountBadge(count: badge, size: 20)
                }
                Spacer()
                TKCircleButton(systemImage: "xmark") {
                    if let onClose { onClose() } else { dismiss() }
                }
            }
        }
        .padding(.horizontal, TK.gutter)
        .padding(.top, 10)
    }
}

/// 36×5 drag handle.
struct TKSheetHandle: View {
    var body: some View {
        Capsule()
            .fill(TK.mono(0.20))
            .frame(width: 36, height: 5)
            .frame(maxWidth: .infinity)
    }
}

// MARK: - Option picker sheet

/// One row of `TKPickerSheet`.
struct TKPickerOption<Value: Hashable>: Identifiable {
    let value: Value
    let label: String
    var icon: AnyView? = nil
    var id: Value { value }

    init(_ value: Value, label: String, icon: (() -> any View)? = nil) {
        self.value = value
        self.label = label
        self.icon = icon.map { AnyView($0()) }
    }
}

/// Bottom sheet listing options in a bg-colored card; the selected one
/// gets an accent check. `searchable` adds the search field (assignee,
/// project, organization pickers).
struct TKPickerSheet<Value: Hashable>: View {
    let title: String
    let options: [TKPickerOption<Value>]
    var selected: Value?
    var searchable = false
    var searchPlaceholder = "Search…"
    var dismissOnPick = true
    let onPick: (Value) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var filtered: [TKPickerOption<Value>] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return options }
        return options.filter { $0.label.localizedCaseInsensitiveContains(q) }
    }

    /// Rows are 50pt; size the detent to the content up to ~80% height.
    private var detent: PresentationDetent {
        let rows = CGFloat(min(options.count, 9))
        let extra: CGFloat = searchable ? 54 : 0
        return .height(min(UIScreen.main.bounds.height * 0.8, 120 + extra + rows * 50))
    }

    var body: some View {
        VStack(spacing: 12) {
            TKSheetHeader(title: title)
            if searchable {
                TKSearchField(text: $query, placeholder: searchPlaceholder, height: 42, autoFocus: true)
                    .padding(.horizontal, TK.gutter)
            }
            ScrollView {
                VStack(spacing: 0) {
                    ForEach(filtered) { option in
                        Button {
                            onPick(option.value)
                            if dismissOnPick { dismiss() }
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
                                if option.value == selected {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 13, weight: .bold))
                                        .foregroundStyle(TK.accent)
                                }
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

// MARK: - Picker icon helpers

enum TKPickerIcon {
    /// 8pt colored dot centered in the icon column.
    static func dot(_ color: Color) -> any View {
        TKDot(color: color).frame(width: 26)
    }

    static func avatar(_ user: UserRef) -> any View {
        AvatarView(user: user, size: 26)
    }

    static func symbol(_ name: String, color: Color = TK.text2) -> any View {
        Image(systemName: name)
            .font(.system(size: 15, weight: .medium))
            .foregroundStyle(color)
            .frame(width: 26)
    }
}

// MARK: - Date picker sheet

/// Month grid (Mon–Sun) with Today / Tomorrow / +1 week / Clear.
struct TKDatePickerSheet: View {
    let title: String
    var selected: Date?
    var allowsClear = true
    let onPick: (Date?) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var month: Date

    init(title: String = "Due date", selected: Date?, allowsClear: Bool = true,
         onPick: @escaping (Date?) -> Void) {
        self.title = title
        self.selected = selected
        self.allowsClear = allowsClear
        self.onPick = onPick
        _month = State(initialValue: Self.firstOfMonth(selected ?? .now))
    }

    private static let cal: Calendar = {
        var c = Calendar(identifier: .iso8601)
        c.firstWeekday = 2
        return c
    }()

    private static func firstOfMonth(_ date: Date) -> Date {
        cal.date(from: cal.dateComponents([.year, .month], from: date))!
    }

    /// 42 cells starting on the Monday on/before the 1st.
    private var cells: [Date] {
        let weekday = Self.cal.component(.weekday, from: month)  // 1 = Sun
        let offset = (weekday + 5) % 7
        let start = Self.cal.date(byAdding: .day, value: -offset, to: month)!
        return (0..<42).map { Self.cal.date(byAdding: .day, value: $0, to: start)! }
    }

    private func pick(_ date: Date?) {
        onPick(date.map(\.startOfDay))
        dismiss()
    }

    var body: some View {
        VStack(spacing: 12) {
            TKSheetHeader(title: title)
            HStack {
                TKCircleButton(systemImage: "chevron.left", fill: .clear) {
                    month = Self.cal.date(byAdding: .month, value: -1, to: month)!
                }
                Spacer()
                Text(month.formatted(.dateTime.month(.wide).year()))
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(TK.text)
                Spacer()
                TKCircleButton(systemImage: "chevron.right", fill: .clear) {
                    month = Self.cal.date(byAdding: .month, value: 1, to: month)!
                }
            }
            .padding(.horizontal, TK.gutter + 4)

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 2), count: 7), spacing: 2) {
                ForEach(["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"], id: \.self) { day in
                    Text(day)
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(0.6)
                        .foregroundStyle(TK.text4)
                        .padding(.vertical, 4)
                }
                ForEach(cells, id: \.self) { date in
                    let inMonth = Self.cal.isDate(date, equalTo: month, toGranularity: .month)
                    let isToday = Self.cal.isDateInToday(date)
                    let isSelected = selected.map { Self.cal.isDate($0, inSameDayAs: date) } ?? false
                    Button {
                        pick(date)
                    } label: {
                        Text("\(Self.cal.component(.day, from: date))")
                            .font(.tkMono(15))
                            .foregroundStyle(isSelected ? .white : inMonth ? TK.text : TK.text5)
                            .frame(maxWidth: .infinity, minHeight: 42)
                            .background(
                                isSelected ? TK.accent : isToday ? TK.accentSoft : .clear,
                                in: .rect(cornerRadius: TK.rChip)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: TK.rChip)
                                    .strokeBorder(isToday && !isSelected ? TK.accentBorder : .clear, lineWidth: 1)
                            )
                            .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, TK.gutter)

            HStack(spacing: 8) {
                quick("Today") { pick(.now) }
                quick("Tomorrow") { pick(Self.cal.date(byAdding: .day, value: 1, to: .now)) }
                quick("+1 week") { pick(Self.cal.date(byAdding: .day, value: 7, to: .now)) }
                if allowsClear {
                    Button { pick(nil) } label: {
                        Text("Clear")
                            .font(.system(size: 14))
                            .foregroundStyle(TK.text2)
                            .frame(maxWidth: .infinity, minHeight: 40)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 12)
            .overlay(alignment: .top) { TKHairline(color: TK.border) }
            .padding(.horizontal, TK.gutter)
            .padding(.bottom, 24)
        }
        .tkSheet(detents: [.height(520)])
    }

    private func quick(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 14))
                .foregroundStyle(TK.text)
                .frame(maxWidth: .infinity, minHeight: 40)
                .background(TK.bg, in: .rect(cornerRadius: TK.rChip))
                .overlay(RoundedRectangle(cornerRadius: TK.rChip).strokeBorder(TK.borderStrong, lineWidth: 1))
        }
        .buttonStyle(TKScaleStyle())
    }
}

// MARK: - Toast

/// Floating pill above the tab bar. Driven by `AppModel.toast(_:)`.
struct TKToastView: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(TK.text)
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(TK.elevated, in: .capsule)
            .overlay(Capsule().strokeBorder(TK.borderInput, lineWidth: 1))
            .shadow(color: .black.opacity(0.45), radius: 12, y: 8)
    }
}

extension View {
    /// Shows `model.toastMessage` above the bottom chrome.
    func tkToast(_ model: AppModel, bottomPadding: CGFloat = 104) -> some View {
        overlay(alignment: .bottom) {
            if let message = model.toastMessage {
                TKToastView(message: message)
                    .padding(.bottom, bottomPadding)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .allowsHitTesting(false)
            }
        }
        .animation(.easeOut(duration: 0.25), value: model.toastMessage)
    }
}

#Preview("Picker") {
    Color.clear.sheet(isPresented: .constant(true)) {
        TKPickerSheet(
            title: "Status",
            options: TaskStatus.allCases.map { status in
                TKPickerOption(status, label: status.label) { StatusDot(status: status, size: 18) }
            },
            selected: TaskStatus.todo
        ) { _ in }
    }
    .preferredColorScheme(.dark)
}

#Preview("Date") {
    Color.clear.sheet(isPresented: .constant(true)) {
        TKDatePickerSheet(selected: .now) { _ in }
    }
    .preferredColorScheme(.dark)
}
