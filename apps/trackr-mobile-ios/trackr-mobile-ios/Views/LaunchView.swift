//
//  LaunchView.swift
//  trackr-mobile-ios
//
//  Boot screen: the animated brand mark on the app background, shown while
//  the session is being restored and — on a cold start with no snapshot
//  cache — until the first refresh lands. Replaces the stock spinner.
//

import SwiftUI

struct LaunchView: View {
    @State private var revealed = false

    var body: some View {
        ZStack {
            Color.webBackground.ignoresSafeArea()
            VStack(spacing: 18) {
                BrandMark(animating: true)
                    .frame(width: 56)
                Text("Trackr")
                    .font(.system(size: 17, weight: .semibold))
                    .tracking(-0.2)
                    .foregroundStyle(.primary)
                    .opacity(revealed ? 1 : 0)
                    .offset(y: revealed ? 0 : 4)
            }
            // Nudged up a touch — dead-centre reads low once the mark is
            // paired with a wordmark.
            .offset(y: -24)
        }
        .onAppear {
            withAnimation(.easeOut(duration: 0.45).delay(0.15)) { revealed = true }
        }
    }
}

#Preview {
    LaunchView()
}
