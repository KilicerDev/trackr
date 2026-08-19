//
//  Color+Hex.swift
//  trackr-mobile-ios
//

import SwiftUI

extension Color {
    /// Colors come from the web app's taxonomy.ts as hex strings — keep them
    /// byte-identical across platforms by constructing from the same hex.
    init(hex: UInt32) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255
        )
    }
}
