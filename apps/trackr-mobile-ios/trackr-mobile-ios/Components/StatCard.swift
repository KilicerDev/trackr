//
//  StatCard.swift
//  trackr-mobile-ios
//
//  Dashboard stat tile: icon, big value, quiet label.
//

import SwiftUI

struct StatCard: View {
    let label: String
    let value: String
    let icon: String
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Image(systemName: icon)
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(color)
                .frame(width: 30, height: 30)
                .background(color.opacity(0.12), in: .rect(cornerRadius: 9))
            Text(value)
                .font(.system(size: 26, weight: .semibold, design: .rounded))
                .monospacedDigit()
            Text(label)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
        )
    }
}

#Preview {
    LazyVGrid(columns: [GridItem(.flexible(), spacing: 12), GridItem(.flexible())], spacing: 12) {
        StatCard(label: "Open Tasks", value: "8", icon: "tray.full", color: Color(hex: 0x7A9CF0))
        StatCard(label: "Logged Today", value: "2h 15m", icon: "clock", color: Color(hex: 0x7FC8A9))
    }
    .padding()
    .background(Color.webBackground)
}
