//
//  WorkspaceSwitchSkeleton.swift
//  trackr-mobile-ios
//
//  Shimmering list placeholder shown over the content area while a
//  workspace switch rebuilds the shell: the top bar already names the new
//  workspace, this fills the space below until that workspace's cache (or
//  first refresh) has painted. Not a loading spinner — the rows mirror the
//  list that's about to appear so the swap reads as one motion.
//

import SwiftUI

struct WorkspaceSwitchSkeleton: View {
    var rows = 7

    var body: some View {
        VStack(spacing: 10) {
            // Filter chips row.
            HStack(spacing: 8) {
                bar(width: 92, height: 32, radius: TK.rToolbar)
                bar(width: 72, height: 32, radius: TK.rToolbar)
                bar(width: 110, height: 32, radius: TK.rToolbar)
                Spacer()
            }
            .padding(.bottom, 4)

            ForEach(0..<rows, id: \.self) { index in
                HStack(alignment: .top, spacing: 12) {
                    bar(width: 10, height: 10, radius: 5)
                        .padding(.top, 5)
                    VStack(alignment: .leading, spacing: 8) {
                        // Vary the widths so the block doesn't read as a grid.
                        bar(width: [220, 160, 250, 190, 230, 140, 210][index % 7], height: 13, radius: 6)
                        HStack(spacing: 8) {
                            bar(width: 58, height: 10, radius: 5)
                            bar(width: 84, height: 10, radius: 5)
                        }
                    }
                    Spacer()
                    bar(width: 26, height: 26, radius: 13)
                }
                .padding(14)
                .background(TK.card, in: .rect(cornerRadius: TK.rCard))
                .overlay(RoundedRectangle(cornerRadius: TK.rCard).strokeBorder(TK.border, lineWidth: 1))
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, TK.gutter)
        .padding(.top, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(TK.bg)
        .shimmer()
        .allowsHitTesting(false)
        .accessibilityLabel("Loading workspace")
    }

    private func bar(width: CGFloat, height: CGFloat, radius: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: radius)
            .fill(TK.mono(0.09))
            .frame(width: width, height: height)
    }
}

/// A soft highlight sweeping left → right across the view, looping.
private struct Shimmer: ViewModifier {
    @State private var phase: CGFloat = -1

    func body(content: Content) -> some View {
        content
            .overlay {
                GeometryReader { proxy in
                    let width = proxy.size.width
                    LinearGradient(
                        colors: [.clear, TK.mono(0.07), .clear],
                        startPoint: .leading, endPoint: .trailing
                    )
                    .frame(width: width * 0.6)
                    .offset(x: phase * width)
                    .blendMode(.plusLighter)
                }
                .allowsHitTesting(false)
            }
            .clipped()
            .onAppear {
                withAnimation(.linear(duration: 1.1).repeatForever(autoreverses: false)) {
                    phase = 1.2
                }
            }
    }
}

extension View {
    func shimmer() -> some View { modifier(Shimmer()) }
}

#Preview {
    WorkspaceSwitchSkeleton()
        .preferredColorScheme(.dark)
}
