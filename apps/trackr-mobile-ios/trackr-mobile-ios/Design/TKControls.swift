//
//  TKControls.swift
//  trackr-mobile-ios
//
//  The reusable control kit of the prototype design. Every screen builds
//  from these — do not restyle them locally; change them here so the app
//  stays one system.
//

import SwiftUI

// MARK: - Card

extension View {
    /// Prototype card: TK.card fill + 1px TK.border outline. `padding` nil
    /// leaves the content flush (lists with hairline rows).
    func tkCard(radius: CGFloat = TK.rCard, padding: CGFloat? = 14, fill: Color = TK.card,
                border: Color = TK.border) -> some View {
        self
            .padding(.all, padding ?? 0)
            .background(fill, in: .rect(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(border, lineWidth: 1))
    }

    /// Pressed look for tappable cards/rows.
    func tkPressable(radius: CGFloat = 0) -> some View {
        buttonStyle(TKPressStyle(radius: radius))
    }
}

/// Row/card press feedback: darkens to TK.cardActive instead of dimming.
struct TKPressStyle: ButtonStyle {
    var radius: CGFloat = 0

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                configuration.isPressed ? TK.cardActive : .clear,
                in: .rect(cornerRadius: radius)
            )
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

// MARK: - Hairlines

/// 1px separator (list rows).
struct TKHairline: View {
    var color: Color = TK.hairline
    var leading: CGFloat = 0

    var body: some View {
        Rectangle()
            .fill(color)
            .frame(height: 1)
            .padding(.leading, leading)
    }
}

// MARK: - Section label

/// "CHECKLIST", "ACTIVITY", "SAVED VIEWS" — 11pt semibold, 0.1em tracking.
struct TKSectionLabel: View {
    let text: String
    var color: Color = TK.text4

    init(_ text: String, color: Color = TK.text4) {
        self.text = text
        self.color = color
    }

    var body: some View {
        Text(text.uppercased())
            .font(.tkSection)
            .tracking(1.1)
            .foregroundStyle(color)
    }
}

// MARK: - Page header

/// 28pt title with a mono meta on the right ("12 open", "Sep 14 – Sep 20").
struct TKPageHeader<Trailing: View>: View {
    let title: String
    @ViewBuilder var trailing: Trailing

    init(_ title: String, @ViewBuilder trailing: () -> Trailing) {
        self.title = title
        self.trailing = trailing()
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline) {
            Text(title)
                .font(.tkPageTitle)
                .tkTitleTracking()
                .foregroundStyle(TK.text)
            Spacer(minLength: 12)
            trailing
        }
        .padding(.horizontal, TK.gutter)
        .padding(.top, 8)
        .padding(.bottom, 4)
    }
}

extension TKPageHeader where Trailing == EmptyView {
    init(_ title: String) {
        self.init(title) { EmptyView() }
    }
}

extension TKPageHeader where Trailing == Text {
    /// Mono meta variant.
    init(_ title: String, meta: String) {
        self.init(title) {
            Text(meta)
                .font(.tkMono(12))
                .foregroundStyle(TK.text3)
        }
    }
}

// MARK: - Toolbar (below the page header)

/// Square toolbar button (40×40, radius 12, card fill) — the top bar's inbox
/// button and the "Today" / prev-next controls use this shape.
struct TKToolbarButton<Label: View>: View {
    var height: CGFloat = 36
    var minWidth: CGFloat = 36
    var active = false
    let action: () -> Void
    @ViewBuilder var label: Label

    var body: some View {
        Button(action: action) {
            label
                .font(.tkToolbar)
                .foregroundStyle(active ? TK.accent : TK.text)
                .padding(.horizontal, 12)
                .frame(minWidth: minWidth, minHeight: height)
                .background(active ? TK.accentSoft : TK.card, in: .rect(cornerRadius: TK.rChip))
                .overlay(
                    RoundedRectangle(cornerRadius: TK.rChip)
                        .strokeBorder(active ? TK.accentBorder : TK.border, lineWidth: 1)
                )
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

/// "Filter" button with the red count badge when filters are active.
struct TKFilterButton: View {
    var count: Int
    var label = "Filter"
    let action: () -> Void

    var body: some View {
        TKToolbarButton(active: count > 0, action: action) {
            HStack(spacing: 6) {
                Image(systemName: "line.3.horizontal.decrease")
                    .font(.system(size: 12, weight: .medium))
                Text(label)
                if count > 0 {
                    TKCountBadge(count: count)
                }
            }
        }
    }
}

/// 18pt red circle with a white bold count.
struct TKCountBadge: View {
    let count: Int
    var size: CGFloat = 18

    var body: some View {
        Text("\(count)")
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(TK.accent, in: .circle)
    }
}

/// Saved-view chip in the list toolbars: accent bookmark + name + chevron,
/// truncating at 60% of the row.
struct TKViewChip: View {
    let name: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: "bookmark")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(TK.accent)
                Text(name)
                    .font(.tkToolbar)
                    .foregroundStyle(TK.text)
                    .lineLimit(1)
                TKChevron()
            }
            .padding(.leading, 10)
            .padding(.trailing, 12)
            .frame(minHeight: 36)
            .background(TK.card, in: .rect(cornerRadius: TK.rChip))
            .overlay(RoundedRectangle(cornerRadius: TK.rChip).strokeBorder(TK.border, lineWidth: 1))
        }
        .buttonStyle(.plain)
    }
}

/// Small down chevron used inside chips (10pt, 40% white).
struct TKChevron: View {
    var direction: Direction = .down
    var color: Color = TK.text3

    enum Direction { case down, right, up }

    var body: some View {
        Image(systemName: direction == .down ? "chevron.down" : direction == .up ? "chevron.up" : "chevron.right")
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(color)
    }
}

// MARK: - Segmented pill

/// The prototype's segmented control: card fill, 3pt inset, selected item
/// on white-10%. Used for List/Board, All/Unread, Theme, Public/Internal.
struct TKSegmented<Option: Hashable, Label: View>: View {
    let options: [Option]
    @Binding var selection: Option
    var fill: Color = TK.card
    var selectedTint: Color? = nil
    @ViewBuilder var label: (Option) -> Label

    var body: some View {
        HStack(spacing: 0) {
            ForEach(options, id: \.self) { option in
                let selected = option == selection
                Button {
                    withAnimation(.snappy(duration: 0.2)) { selection = option }
                } label: {
                    label(option)
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(
                            selected ? (selectedTint ?? TK.text) : TK.text2
                        )
                        .padding(.horizontal, 10)
                        .frame(minHeight: 28)
                        .background(
                            selected
                                ? (selectedTint?.opacity(0.2) ?? TK.mono(0.10))
                                : .clear,
                            in: .rect(cornerRadius: TK.rSegmentItem)
                        )
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(fill, in: .rect(cornerRadius: TK.rSegment))
        .overlay(RoundedRectangle(cornerRadius: TK.rSegment).strokeBorder(TK.border, lineWidth: 1))
    }
}

extension TKSegmented where Label == Text {
    init(_ options: [Option], selection: Binding<Option>, fill: Color = TK.card,
         title: @escaping (Option) -> String) {
        self.init(options: options, selection: selection, fill: fill, selectedTint: nil) {
            Text(title($0))
        }
    }
}

// MARK: - Buttons

/// Full-width accent CTA ("Show 12 tickets", "Create task & log 2h").
struct TKPrimaryButton: View {
    let title: String
    var icon: String? = nil
    var enabled = true
    var height: CGFloat = 50
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon {
                    Image(systemName: icon).font(.system(size: 13, weight: .bold))
                }
                Text(title)
            }
            .font(.system(size: height >= 50 ? 16 : 14, weight: .semibold))
            .foregroundStyle(enabled ? .white : .white.opacity(0.6))
            .frame(maxWidth: .infinity, minHeight: height)
            .background(
                enabled ? TK.accent : TK.accentDisabled,
                in: .rect(cornerRadius: height >= 50 ? TK.rCardSm : TK.rButton)
            )
        }
        .buttonStyle(TKScaleStyle())
        .disabled(!enabled)
    }
}

/// Compact accent button for sheet footers (42pt, radius 11).
struct TKAccentButton: View {
    let title: String
    var icon: String? = nil
    var enabled = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                if let icon { Image(systemName: icon).font(.system(size: 11, weight: .bold)) }
                Text(title)
            }
            .font(.system(size: 14, weight: .semibold))
            .foregroundStyle(enabled ? .white : .white.opacity(0.6))
            .padding(.horizontal, 18)
            .frame(minHeight: 42)
            .background(enabled ? TK.accent : TK.accentDisabled, in: .rect(cornerRadius: TK.rButton))
        }
        .buttonStyle(TKScaleStyle())
        .disabled(!enabled)
    }
}

/// Neutral button (Cancel, Back, +30m): elevated fill + strong border.
struct TKSecondaryButton: View {
    let title: String
    var icon: String? = nil
    var fill: Color = TK.elevated
    var height: CGFloat = 42
    var expand = false
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 7) {
                if let icon { Image(systemName: icon).font(.system(size: 12, weight: .semibold)) }
                Text(title)
            }
            .font(.system(size: 14, weight: .medium))
            .foregroundStyle(TK.text)
            .padding(.horizontal, 16)
            .frame(maxWidth: expand ? .infinity : nil, minHeight: height)
            .background(fill, in: .rect(cornerRadius: TK.rButton))
            .overlay(RoundedRectangle(cornerRadius: TK.rButton).strokeBorder(TK.borderStrong, lineWidth: 1))
        }
        .buttonStyle(TKScaleStyle())
    }
}

/// Text-only quiet button ("Clear all", "Discard session", "Mark all read").
struct TKQuietButton: View {
    let title: String
    var color: Color = TK.text2
    var weight: Font.Weight = .regular
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.system(size: 13, weight: weight))
                .foregroundStyle(color)
                .padding(.vertical, 6)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
    }
}

struct TKScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
            .opacity(configuration.isPressed ? 0.92 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

/// Round 36pt icon-only button ("×" close, circle actions).
struct TKCircleButton: View {
    let systemImage: String
    var size: CGFloat = 36
    var fill: Color = TK.mono(0.06)
    var color: Color = TK.text2
    var iconSize: CGFloat = 12
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: iconSize, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: size, height: size)
                .background(fill, in: .circle)
                .contentShape(.circle)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Group header band

/// Sticky band above a group's rows: chevron (collapsible), colored dot,
/// bold name, mono count. Full-bleed on TK.bgRaised with a hairline above.
struct TKGroupBand: View {
    let title: String
    var color: Color? = nil
    var count: Int? = nil
    var collapsible = false
    var collapsed = false
    var titleColor: Color = TK.text
    var trailing: String? = nil
    var onToggle: (() -> Void)? = nil

    var body: some View {
        Button {
            onToggle?()
        } label: {
            HStack(spacing: 8) {
                if collapsible {
                    TKChevron()
                        .rotationEffect(.degrees(collapsed ? -90 : 0))
                }
                if let color {
                    Circle().fill(color).frame(width: 8, height: 8)
                }
                Text(title)
                    .font(.tkGroup)
                    .foregroundStyle(titleColor)
                    .lineLimit(1)
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
            .padding(.horizontal, TK.gutter)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 44)
            .background(TK.bgRaised)
            .overlay(alignment: .top) { TKHairline(color: TK.hairlineStrong) }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(onToggle == nil)
    }
}

// MARK: - Indicators

/// 20pt done toggle: ring at 35% → green fill with a white check.
struct TKCheckCircle: View {
    let done: Bool
    var size: CGFloat = 20

    var body: some View {
        ZStack {
            Circle()
                .strokeBorder(done ? TK.success : TK.text4, lineWidth: 1.6)
            if done {
                Circle().fill(TK.success)
                Image(systemName: "checkmark")
                    .font(.system(size: size * 0.5, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .animation(.snappy(duration: 0.18), value: done)
    }
}

/// 22pt checklist box (radius 6): accent fill when done.
struct TKCheckBox: View {
    let done: Bool

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 6)
                .strokeBorder(done ? TK.accent : TK.mono(0.30), lineWidth: 1.6)
            if done {
                RoundedRectangle(cornerRadius: 6).fill(TK.accent)
                Image(systemName: "checkmark")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: 22, height: 22)
        .animation(.easeOut(duration: 0.15), value: done)
    }
}

/// 8pt accent dot with the recording pulse (live session).
struct TKLiveDot: View {
    var color: Color = TK.accent
    var pulsing = true
    @State private var phase = false

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: 8, height: 8)
            .overlay {
                if pulsing {
                    Circle()
                        .stroke(color.opacity(phase ? 0 : 0.55), lineWidth: 3)
                        .scaleEffect(phase ? 2.4 : 1)
                }
            }
            .onAppear {
                guard pulsing else { return }
                withAnimation(.easeOut(duration: 1.8).repeatForever(autoreverses: false)) {
                    phase = true
                }
            }
    }
}

/// 8pt status dot (tickets, orgs, groups).
struct TKDot: View {
    let color: Color
    var size: CGFloat = 8

    var body: some View {
        Circle().fill(color).frame(width: size, height: size)
    }
}

/// Thin progress bar (capacity, checklist, logged time).
struct TKBar: View {
    let fraction: Double
    var color: Color = TK.accent
    var height: CGFloat = 4
    var width: CGFloat? = nil

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .leading) {
                Capsule().fill(TK.mono(0.10))
                Capsule()
                    .fill(color)
                    .frame(width: geo.size.width * min(1, max(0, fraction)))
            }
        }
        .frame(width: width, height: height)
        .animation(.easeOut(duration: 0.3), value: fraction)
    }
}

/// Mono tag chip (blue tint), the prototype's `sem` / `website` look.
struct TKTagChip: View {
    let tag: String

    var body: some View {
        Text(tag)
            .font(.tkMono(11))
            .foregroundStyle(TK.tagText)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(TK.tagFill, in: .rect(cornerRadius: 5))
    }
}

// MARK: - Settings-style rows

/// Card row: 15pt label (+ optional 12pt description) with trailing content,
/// min height 52. Stack inside `.tkCard(padding: nil)` with TKHairline.
struct TKRow<Trailing: View>: View {
    let label: String
    var detail: String? = nil
    @ViewBuilder var trailing: Trailing

    var body: some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(label)
                    .font(.tkRow)
                    .foregroundStyle(TK.text)
                if let detail {
                    Text(detail)
                        .font(.tkMeta)
                        .foregroundStyle(TK.text3)
                }
            }
            Spacer(minLength: 8)
            trailing
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(minHeight: 52)
    }
}

/// Navigation-style row value: "English ›".
struct TKRowValue: View {
    let value: String
    var color: Color = TK.text2

    var body: some View {
        HStack(spacing: 6) {
            Text(value)
                .font(.tkRow)
                .foregroundStyle(color)
                .lineLimit(1)
            TKChevron(direction: .down, color: color)
        }
    }
}

/// Right chevron for pushed rows.
struct TKDisclosure: View {
    var body: some View {
        Image(systemName: "chevron.right")
            .font(.system(size: 12, weight: .semibold))
            .foregroundStyle(TK.mono(0.30))
    }
}

// MARK: - Inputs

/// Search field: card fill, 12% border, radius 14, 48pt.
struct TKSearchField: View {
    @Binding var text: String
    var placeholder = "Search…"
    var height: CGFloat = 48
    var autoFocus = false
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 15, weight: .medium))
                .foregroundStyle(TK.text3)
            TextField(placeholder, text: $text)
                .font(.system(size: height >= 48 ? 16 : 15))
                .foregroundStyle(TK.text)
                .focused($focused)
                .autocorrectionDisabled()
            if !text.isEmpty {
                TKCircleButton(systemImage: "xmark", size: 30, fill: TK.mono(0.08), iconSize: 10) {
                    text = ""
                }
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 8)
        .frame(height: height)
        .background(TK.card, in: .rect(cornerRadius: TK.rInput))
        .overlay(RoundedRectangle(cornerRadius: TK.rInput).strokeBorder(TK.borderInput, lineWidth: 1))
        .onAppear { if autoFocus { focused = true } }
    }
}

/// Bordered text input on a sheet (e.g. finish-session title).
struct TKTextInput: View {
    @Binding var text: String
    var placeholder = ""
    var font: Font = .system(size: 17, weight: .semibold)

    var body: some View {
        TextField(placeholder, text: $text)
            .font(font)
            .foregroundStyle(TK.text)
            .padding(14)
            .background(TK.bg, in: .rect(cornerRadius: TK.rInput))
            .overlay(RoundedRectangle(cornerRadius: TK.rInput).strokeBorder(TK.borderInput, lineWidth: 1))
    }
}

/// Prototype toggle: 46×28, accent when on.
struct TKToggle: View {
    @Binding var isOn: Bool

    var body: some View {
        Button {
            withAnimation(.snappy(duration: 0.2)) { isOn.toggle() }
        } label: {
            ZStack(alignment: isOn ? .trailing : .leading) {
                Capsule().fill(isOn ? TK.accent : TK.mono(0.15))
                Circle()
                    .fill(.white)
                    .frame(width: 22, height: 22)
                    .shadow(color: .black.opacity(0.3), radius: 1.5, y: 1)
                    .padding(3)
            }
            .frame(width: 46, height: 28)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Empty state

struct TKEmptyState: View {
    let text: String
    var padding: CGFloat = 60

    var body: some View {
        Text(text)
            .font(.system(size: 14))
            .foregroundStyle(TK.text3)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
            .padding(.vertical, padding)
            .padding(.horizontal, 24)
    }
}

// MARK: - Previews

#Preview("Controls") {
    ScrollView {
        VStack(alignment: .leading, spacing: 18) {
            TKPageHeader("Tickets", meta: "12 open")
            HStack(spacing: 8) {
                TKViewChip(name: "assigned to me") {}
                Spacer()
                TKFilterButton(count: 2) {}
            }
            .padding(.horizontal, 16)
            TKGroupBand(title: "Open", color: Color(hex: 0x7A9CF0), count: 4, collapsible: true) {}
            VStack(alignment: .leading, spacing: 12) {
                TKSectionLabel("Layout")
                VStack(spacing: 0) {
                    TKRow(label: "Group by") { TKRowValue(value: "Status") }
                    TKHairline()
                    TKRow(label: "Quiet hours", detail: "Pause instant email") { TKToggle(isOn: .constant(true)) }
                }
                .tkCard(padding: nil)
                HStack {
                    TKCheckCircle(done: false)
                    TKCheckCircle(done: true)
                    TKCheckBox(done: true)
                    TKLiveDot()
                    TKTagChip(tag: "sem")
                    TKBar(fraction: 0.4, width: 80)
                }
                TKSearchField(text: .constant(""), placeholder: "Tickets, tasks, projects…")
                TKPrimaryButton(title: "Show 12 tickets") {}
                HStack {
                    TKSecondaryButton(title: "Cancel") {}
                    TKAccentButton(title: "Create ticket") {}
                }
            }
            .padding(.horizontal, 16)
        }
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
