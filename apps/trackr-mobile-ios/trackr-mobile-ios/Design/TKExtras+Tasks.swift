//
//  TKExtras+Tasks.swift
//  trackr-mobile-ios
//
//  Kit additions the task screens needed that the base kit doesn't offer
//  yet: the week's day band (name + mono date + TODAY pill + count), the
//  small uppercase pill (NOW / TODAY), a multi-select variant of the
//  option picker sheet (assignees), and the play button of week rows.
//  Candidates for folding into TKControls / TKSheets.
//

import SwiftUI

// MARK: - Pill

/// 10pt bold uppercase pill on the accent-soft tint ("NOW", "TODAY").
struct TKPill: View {
    let text: String
    var color: Color = TK.accent
    var fill: Color = TK.accentSofter

    var body: some View {
        Text(text.uppercased())
            .font(.system(size: 10, weight: .bold))
            .tracking(0.8)
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(fill, in: .rect(cornerRadius: 5))
    }
}

// MARK: - Day band (My week)

/// `TKGroupBand` for a weekday: bold name (accent when today), mono date,
/// TODAY pill, mono task count, mono hours on the right. Same metric as
/// the group band (44pt, raised background, hairline above).
struct TKDayBand: View {
    let name: String
    let date: String
    var isToday = false
    var muted = false
    var count: Int? = nil
    var trailing: String? = nil

    var body: some View {
        HStack(spacing: 8) {
            Text(name)
                .font(.tkGroup)
                .foregroundStyle(isToday ? TK.accent : muted ? TK.text2 : TK.text)
                .lineLimit(1)
            Text(date)
                .font(.tkMono(12))
                .foregroundStyle(TK.text3)
            if isToday {
                TKPill(text: "Today")
            }
            if let count, count > 0 {
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
    }
}

// MARK: - Multi-select picker sheet

// MARK: - Row play button

/// 36×36 tap area with the accent play glyph (week rows); dims to the
/// ghost tone when another session already runs.
struct TKPlayButton: View {
    var active = true
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: "play.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(active ? TK.accent : TK.text5)
                .frame(width: 36, height: 36)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(!active)
        .accessibilityLabel("Start session")
    }
}

#Preview("Extras") {
    VStack(spacing: 0) {
        TKDayBand(name: "Monday", date: "14", isToday: true, count: 2, trailing: "3h 30m")
        TKDayBand(name: "Saturday", date: "19", muted: true, trailing: "0m")
        HStack {
            TKPill(text: "Now")
            TKPlayButton {}
        }
        .padding()
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
