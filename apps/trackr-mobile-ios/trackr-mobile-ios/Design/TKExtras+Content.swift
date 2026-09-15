//
//  TKExtras+Content.swift
//  trackr-mobile-ios
//
//  Kit additions used by the content package (chat, notes, meetings,
//  wiki, attachments): icon tiles, day separators, colored tag chips, the
//  multi-line input card, dashed "+ …" chips, a sheet footer and the
//  square "+" header button. Same tokens, same metrics as TKControls.
//

import SwiftUI

// MARK: - Icon tile

/// Square icon tile (22pt default, radius 6): glyph on a soft fill with a
/// hairline outline — search rows, wiki rows, note cards, file rows.
struct TKIconTile: View {
    let systemImage: String
    var size: CGFloat = 22
    var color: Color = TK.text2
    var fill: Color? = nil

    private var radius: CGFloat { size >= 32 ? 9 : 6 }

    var body: some View {
        Image(systemName: systemImage)
            .font(.system(size: (size * 0.5).rounded(), weight: .medium))
            .foregroundStyle(color)
            .frame(width: size, height: size)
            .background(fill ?? TK.mono(0.06), in: .rect(cornerRadius: radius))
            .overlay(RoundedRectangle(cornerRadius: radius).strokeBorder(TK.border, lineWidth: 1))
    }
}

// MARK: - Day separator

/// Mono 11 label centered between two hairlines ("Today", "Sep 12").
struct TKDaySeparator: View {
    let text: String

    var body: some View {
        HStack(spacing: 10) {
            TKHairline(color: TK.hairlineStrong)
            Text(text)
                .font(.tkMono(11))
                .foregroundStyle(TK.text4)
                .fixedSize()
            TKHairline(color: TK.hairlineStrong)
        }
    }
}

// MARK: - Colored tag chip

/// `TKTagChip` in a caller-provided color (chat tags carry their own).
struct TKColorTagChip: View {
    let label: String
    let color: Color

    var body: some View {
        Text(label)
            .font(.tkMono(11))
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(color.opacity(0.15), in: .rect(cornerRadius: 5))
    }
}

// MARK: - Multi-line input

/// Text editor on the input surface (TK.bg, radius 14, 12% border) with
/// a placeholder — the note body / thread message field on sheets.
struct TKTextArea: View {
    @Binding var text: String
    var placeholder = ""
    var minHeight: CGFloat = 140
    var font: Font = .system(size: 15)

    var body: some View {
        ZStack(alignment: .topLeading) {
            if text.isEmpty {
                Text(placeholder)
                    .font(font)
                    .foregroundStyle(TK.text4)
                    .padding(.horizontal, 14 + 5)
                    .padding(.top, 12 + 8)
                    .allowsHitTesting(false)
            }
            TextEditor(text: $text)
                .font(font)
                .foregroundStyle(TK.text)
                .lineSpacing(3)
                .scrollContentBackground(.hidden)
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .frame(minHeight: minHeight)
        }
        .background(TK.bg, in: .rect(cornerRadius: TK.rInput))
        .overlay(RoundedRectangle(cornerRadius: TK.rInput).strokeBorder(TK.borderInput, lineWidth: 1))
    }
}

// MARK: - Dashed chip

/// "+ Tags", "+ Add files" — 38pt ghost chip with the dashed outline.
struct TKDashedChip: View {
    let title: String
    var icon = "plus"
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            PropertyChip(style: .empty) {
                Image(systemName: icon)
                    .font(.system(size: 11, weight: .semibold))
                Text(title)
            }
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Sheet footer

/// Hairline above, Cancel on the left, accent CTA on the right.
struct TKSheetFooter: View {
    let cta: String
    var enabled = true
    let onCancel: () -> Void
    let onConfirm: () -> Void

    var body: some View {
        HStack(spacing: 10) {
            TKSecondaryButton(title: "Cancel", action: onCancel)
            Spacer(minLength: 0)
            TKAccentButton(title: cta, enabled: enabled, action: onConfirm)
        }
        .padding(.horizontal, TK.gutter)
        .padding(.top, 12)
        .padding(.bottom, 8)
        .overlay(alignment: .top) { TKHairline(color: TK.border) }
    }
}

// MARK: - Header "+" button

/// 36pt square "+" next to a page header's mono meta (new thread / note /
/// meeting).
struct TKPlusButton: View {
    var label = "New"
    let action: () -> Void

    var body: some View {
        TKToolbarButton(minWidth: 36, action: action) {
            Image(systemName: "plus")
                .font(.system(size: 14, weight: .semibold))
        }
        .accessibilityLabel(label)
    }
}

// MARK: - Plain text from body_html

extension String {
    /// Tag-stripped, whitespace-collapsed preview of a body_html document
    /// (list cards, search snippets). Not a parser — the real renderer is
    /// `RichContentParser`.
    var htmlPreviewText: String {
        var text = replacingOccurrences(
            of: "</(p|h1|h2|h3|li|blockquote|pre|div)>", with: " ",
            options: [.regularExpression, .caseInsensitive]
        )
        text = text.replacingOccurrences(
            of: "<br\\s*/?>", with: " ", options: [.regularExpression, .caseInsensitive]
        )
        text = text.replacingOccurrences(of: "<[^>]+>", with: "", options: .regularExpression)
        for (entity, plain) in [("&amp;", "&"), ("&lt;", "<"), ("&gt;", ">"), ("&quot;", "\""),
                                ("&#39;", "'"), ("&nbsp;", " ")] {
            text = text.replacingOccurrences(of: entity, with: plain)
        }
        return text
            .replacingOccurrences(of: "\\s+", with: " ", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
}

#Preview("Content extras") {
    VStack(alignment: .leading, spacing: 16) {
        HStack(spacing: 10) {
            TKIconTile(systemImage: "doc.text")
            TKIconTile(systemImage: "folder", size: 36, color: TK.accent, fill: TK.accentSoft)
            TKColorTagChip(label: "network", color: Color(hex: 0x7A9CF0))
            TKPlusButton {}
        }
        TKDaySeparator(text: "Today")
        TKTextArea(text: .constant(""), placeholder: "Start writing…", minHeight: 100)
        TKDashedChip(title: "Tags") {}
        TKSheetFooter(cta: "Save", onCancel: {}, onConfirm: {})
    }
    .padding()
    .background(TK.card)
    .preferredColorScheme(.dark)
}
