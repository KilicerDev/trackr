//
//  TKExtras+Sheets.swift
//  trackr-mobile-ios
//
//  Kit additions used by the create / view-options / session sheets:
//  a multi-select variant of TKPickerSheet, a one-line text prompt sheet
//  (save / rename a view) and a card row with a value + clear column.
//

import SwiftUI

// MARK: - Multi-select picker sheet

/// `TKPickerSheet` for set-valued filters: every row toggles its value and
/// shows an accent check while selected; the sheet stays open ("Done"
/// closes it). Presented with `.sheet(item:)` like the single picker.
struct TKMultiPickerSheet<Value: Hashable>: View {
    let title: String
    let options: [TKPickerOption<Value>]
    var selected: Set<Value>
    var searchable = false
    var searchPlaceholder = "Search…"
    let onToggle: (Value) -> Void
    var onClear: (() -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    init(title: String, options: [TKPickerOption<Value>], selected: Set<Value>,
         searchable: Bool = false, searchPlaceholder: String = "Search…",
         onToggle: @escaping (Value) -> Void, onClear: (() -> Void)? = nil) {
        self.title = title
        self.options = options
        self.selected = selected
        self.searchable = searchable
        self.searchPlaceholder = searchPlaceholder
        self.onToggle = onToggle
        self.onClear = onClear
    }

    /// Predicate form for call sites that don't keep a `Set` (e.g. the task
    /// assignees array).
    init(title: String, options: [TKPickerOption<Value>], isSelected: (Value) -> Bool,
         searchable: Bool = false, searchPlaceholder: String = "Search…",
         onToggle: @escaping (Value) -> Void, onClear: (() -> Void)? = nil) {
        self.init(
            title: title, options: options,
            selected: Set(options.map(\.value).filter(isSelected)),
            searchable: searchable, searchPlaceholder: searchPlaceholder,
            onToggle: onToggle, onClear: onClear
        )
    }

    private var filtered: [TKPickerOption<Value>] {
        let q = query.trimmingCharacters(in: .whitespaces)
        guard !q.isEmpty else { return options }
        return options.filter { $0.label.localizedCaseInsensitiveContains(q) }
    }

    private var detent: PresentationDetent {
        let rows = CGFloat(min(options.count, 9))
        let extra: CGFloat = searchable ? 54 : 0
        return .height(min(UIScreen.main.bounds.height * 0.8, 190 + extra + rows * 50))
    }

    var body: some View {
        VStack(spacing: 12) {
            TKSheetHeader(title: title, badge: selected.count)
            if searchable {
                TKSearchField(text: $query, placeholder: searchPlaceholder, height: 42, autoFocus: true)
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
                                ZStack {
                                    Circle()
                                        .strokeBorder(isOn ? TK.accent : TK.mono(0.25), lineWidth: 1.5)
                                    if isOn {
                                        Circle().fill(TK.accent)
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 10, weight: .bold))
                                            .foregroundStyle(.white)
                                    }
                                }
                                .frame(width: 22, height: 22)
                                .animation(.snappy(duration: 0.18), value: isOn)
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
            }
            HStack(spacing: 10) {
                if let onClear {
                    TKSecondaryButton(title: "Clear", height: 44) { onClear() }
                        .disabled(selected.isEmpty)
                        .opacity(selected.isEmpty ? 0.5 : 1)
                }
                TKPrimaryButton(title: "Done", height: 44) { dismiss() }
            }
            .padding(.horizontal, TK.gutter)
            .padding(.bottom, 20)
        }
        .tkSheet(detents: [detent, .large])
    }
}

// MARK: - Text prompt sheet

/// One-line text prompt on a fitted sheet ("Save view", "Rename view").
struct TKTextPromptSheet: View {
    let title: String
    var placeholder = "Name"
    var hint: String? = nil
    var confirmTitle = "Save"
    var initialText = ""
    var maxLength: Int? = nil
    let onConfirm: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text: String
    @FocusState private var focused: Bool

    init(title: String, placeholder: String = "Name", hint: String? = nil,
         confirmTitle: String = "Save", initialText: String = "", maxLength: Int? = nil,
         onConfirm: @escaping (String) -> Void) {
        self.title = title
        self.placeholder = placeholder
        self.hint = hint
        self.confirmTitle = confirmTitle
        self.initialText = initialText
        self.maxLength = maxLength
        self.onConfirm = onConfirm
        _text = State(initialValue: initialText)
    }

    private var trimmed: String { text.trimmingCharacters(in: .whitespacesAndNewlines) }

    private func confirm() {
        guard !trimmed.isEmpty else { return }
        onConfirm(trimmed)
        dismiss()
    }

    var body: some View {
        VStack(spacing: 14) {
            TKSheetHeader(title: title)
            TextField(placeholder, text: $text)
                .font(.system(size: 17, weight: .semibold))
                .foregroundStyle(TK.text)
                .focused($focused)
                .submitLabel(.done)
                .onSubmit(confirm)
                .onChange(of: text) { _, value in
                    if let maxLength, value.count > maxLength {
                        text = String(value.prefix(maxLength))
                    }
                }
                .padding(14)
                .background(TK.bg, in: .rect(cornerRadius: TK.rInput))
                .overlay(RoundedRectangle(cornerRadius: TK.rInput).strokeBorder(TK.borderInput, lineWidth: 1))
                .padding(.horizontal, TK.gutter)
            if let hint {
                Text(hint)
                    .font(.system(size: 12))
                    .foregroundStyle(TK.text3)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.horizontal, TK.gutter)
            }
            HStack(spacing: 10) {
                TKSecondaryButton(title: "Cancel", height: 46, expand: true) { dismiss() }
                TKPrimaryButton(title: confirmTitle, enabled: !trimmed.isEmpty, height: 46, action: confirm)
            }
            .padding(.horizontal, TK.gutter)
            .padding(.bottom, 16)
        }
        .tkSheet(detents: [.height(hint == nil ? 230 : 256)])
        .onAppear { focused = true }
    }
}

// MARK: - Value row

/// Card row: optional leading glyph, 15pt label, value on the right with a
/// down chevron (opens a picker) and an `×` clear column while a value is
/// set. Stack inside `.tkCard(padding: nil)` with `TKHairline`.
struct TKValueRow<Leading: View, Accessory: View>: View {
    let label: String
    let value: String
    var active = false
    var onClear: (() -> Void)? = nil
    let action: () -> Void
    @ViewBuilder var leading: Leading
    @ViewBuilder var accessory: Accessory

    init(label: String, value: String, active: Bool = false, onClear: (() -> Void)? = nil,
         action: @escaping () -> Void,
         @ViewBuilder leading: () -> Leading,
         @ViewBuilder accessory: () -> Accessory) {
        self.label = label
        self.value = value
        self.active = active
        self.onClear = onClear
        self.action = action
        self.leading = leading()
        self.accessory = accessory()
    }

    var body: some View {
        HStack(spacing: 0) {
            Button(action: action) {
                HStack(spacing: 10) {
                    leading
                    Text(label)
                        .font(.tkRow)
                        .foregroundStyle(TK.text)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    accessory
                    Text(value)
                        .font(.tkRow)
                        .foregroundStyle(active ? TK.text : TK.text3)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .layoutPriority(-1)
                    TKChevron()
                }
                .padding(.leading, 14)
                .padding(.trailing, active && onClear != nil ? 6 : 14)
                .frame(minHeight: 52)
                .contentShape(.rect)
            }
            .buttonStyle(TKPressStyle())
            if active, let onClear {
                TKCircleButton(systemImage: "xmark", size: 30, fill: TK.mono(0.08), iconSize: 10, action: onClear)
                    .padding(.trailing, 10)
                    .accessibilityLabel("Clear \(label)")
            }
        }
    }
}

extension TKValueRow where Leading == EmptyView, Accessory == EmptyView {
    init(label: String, value: String, active: Bool = false, onClear: (() -> Void)? = nil,
         action: @escaping () -> Void) {
        self.init(label: label, value: value, active: active, onClear: onClear, action: action,
                  leading: { EmptyView() }, accessory: { EmptyView() })
    }
}

extension TKValueRow where Accessory == EmptyView {
    init(label: String, value: String, active: Bool = false, onClear: (() -> Void)? = nil,
         action: @escaping () -> Void, @ViewBuilder leading: () -> Leading) {
        self.init(label: label, value: value, active: active, onClear: onClear, action: action,
                  leading: leading, accessory: { EmptyView() })
    }
}

// MARK: - Chip buttons

/// Saved-view chip: bookmark + name; accent style while selected.
struct TKBookmarkChip: View {
    let name: String
    var selected = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: selected ? "bookmark.fill" : "bookmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(TK.accent)
                Text(name)
                    .font(.tkChip)
                    .foregroundStyle(selected ? TK.accent : TK.text)
                    .lineLimit(1)
            }
            .padding(.horizontal, 12)
            .frame(height: 38)
            .background(selected ? TK.accentSoft : TK.bg, in: .rect(cornerRadius: TK.rChip))
            .overlay(
                RoundedRectangle(cornerRadius: TK.rChip)
                    .strokeBorder(selected ? TK.accentBorder : TK.borderStrong, lineWidth: 1)
            )
            .contentShape(.rect)
        }
        .buttonStyle(TKScaleStyle())
    }
}

/// Dashed ghost chip ("+ Save current", "Attach", "Due date").
struct TKGhostChip: View {
    let title: String
    var icon: String? = "plus"
    var height: CGFloat = 38
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                if let icon {
                    Image(systemName: icon).font(.system(size: 11, weight: .semibold))
                }
                Text(title)
            }
            .font(.tkChip)
            .foregroundStyle(TK.text2)
            .padding(.horizontal, 12)
            .frame(height: height)
            .overlay(
                RoundedRectangle(cornerRadius: TK.rChip)
                    .strokeBorder(TK.borderDashed, style: StrokeStyle(lineWidth: 1, dash: [4, 3]))
            )
            .contentShape(.rect)
        }
        .buttonStyle(TKScaleStyle())
    }
}

/// 38pt tall picker chip for the create sheet: glyph + label + chevron.
/// Empty values render dashed (`PropertyChipStyle.empty`).
struct TKChipButton<Content: View>: View {
    var style: PropertyChipStyle = .filled
    var leadingInset: CGFloat = 12
    let action: () -> Void
    @ViewBuilder var content: () -> Content

    var body: some View {
        Button(action: action) {
            PropertyChip(style: style, chevron: style != .empty, leadingInset: leadingInset, content: content)
        }
        .buttonStyle(TKScaleStyle())
    }
}

#Preview("Multi picker") {
    Color.clear.sheet(isPresented: .constant(true)) {
        TKMultiPickerSheet(
            title: "Status",
            options: TaskStatus.allCases.map { status in
                TKPickerOption(status, label: status.label) { StatusDot(status: status, size: 18) }
            },
            selected: [.todo, .inProgress],
            onToggle: { _ in }
        )
    }
    .preferredColorScheme(.dark)
}

#Preview("Prompt") {
    Color.clear.sheet(isPresented: .constant(true)) {
        TKTextPromptSheet(title: "Save view", hint: "Saves the current filters as a reusable view — on the web too.") { _ in }
    }
    .preferredColorScheme(.dark)
}
