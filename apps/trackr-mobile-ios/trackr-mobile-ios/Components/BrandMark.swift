//
//  BrandMark.swift
//  trackr-mobile-ios
//
//  The trackr logo — three vertical bars (brand/logo/pure-logo.png), drawn
//  natively so it stays crisp at any size and tints like an SF Symbol.
//  Proportions traced from the source asset (834×790, bars 225 wide with
//  ~80pt gaps).
//
//  With `animating` the bars breathe in a staggered wave, equalizer-style
//  (the boot screen). Under Reduce Motion they hold still and only the
//  opacity pulses softly.
//

import SwiftUI

struct BrandMark: View {
    var color: Color = Color(hex: 0xFF4867)
    var animating = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Group {
            if animating {
                TimelineView(.animation(minimumInterval: 1 / 60, paused: reduceMotion)) { context in
                    let t = context.date.timeIntervalSinceReferenceDate
                    bars { index in reduceMotion ? 1 : Self.scale(at: t, bar: index) }
                        .opacity(reduceMotion ? Self.pulse(at: t) : 1)
                }
            } else {
                bars { _ in 1 }
            }
        }
        // Source asset is 834×790 — very slightly wider than tall.
        .aspectRatio(834 / 790, contentMode: .fit)
    }

    private func bars(scaleY: @escaping (Int) -> CGFloat) -> some View {
        GeometryReader { geo in
            let width = geo.size.width
            let barWidth = width * 0.27
            let gap = (width - barWidth * 3) / 2
            let radius = barWidth * 0.08
            HStack(spacing: gap) {
                ForEach(0..<3, id: \.self) { index in
                    RoundedRectangle(cornerRadius: radius)
                        .fill(color)
                        .frame(width: barWidth)
                        .scaleEffect(x: 1, y: scaleY(index), anchor: .center)
                }
            }
        }
    }

    /// One slow wave (1.4 s) travelling left→right; each bar dips to 45 %
    /// and back. The per-bar offset keeps them out of phase.
    private static func scale(at t: TimeInterval, bar: Int) -> CGFloat {
        let period = 1.4
        let phase = (t / period) * 2 * .pi - Double(bar) * 0.9
        let wave = (sin(phase) + 1) / 2  // 0…1
        return 0.45 + 0.55 * wave
    }

    private static func pulse(at t: TimeInterval) -> Double {
        0.7 + 0.3 * (sin(t * 2 * .pi / 1.6) + 1) / 2
    }
}

#Preview {
    VStack(spacing: 24) {
        BrandMark().frame(width: 56)
        BrandMark(animating: true).frame(width: 56)
        BrandMark(color: .white)
            .frame(width: 22)
            .frame(width: 48, height: 48)
            .background(Color(hex: 0xFF4867), in: .rect(cornerRadius: 12))
        BrandMark().frame(width: 18)
    }
    .padding()
}
