//
//  BrandMark.swift
//  trackr-mobile-ios
//
//  The trackr logo — three vertical bars (brand/logo/pure-logo.png), drawn
//  natively so it stays crisp at any size and tints like an SF Symbol.
//  Proportions traced from the source asset (834×790, bars 225 wide with
//  ~80pt gaps).
//

import SwiftUI

struct BrandMark: View {
    var color: Color = Color(hex: 0xFF4867)

    var body: some View {
        GeometryReader { geo in
            let width = geo.size.width
            let barWidth = width * 0.27
            let gap = (width - barWidth * 3) / 2
            let radius = barWidth * 0.08
            HStack(spacing: gap) {
                ForEach(0..<3, id: \.self) { _ in
                    RoundedRectangle(cornerRadius: radius)
                        .fill(color)
                        .frame(width: barWidth)
                }
            }
        }
        // Source asset is 834×790 — very slightly wider than tall.
        .aspectRatio(834 / 790, contentMode: .fit)
    }
}

#Preview {
    VStack(spacing: 24) {
        BrandMark().frame(width: 56)
        BrandMark(color: .white)
            .frame(width: 22)
            .frame(width: 48, height: 48)
            .background(Color(hex: 0xFF4867), in: .rect(cornerRadius: 12))
        BrandMark().frame(width: 18)
    }
    .padding()
}
