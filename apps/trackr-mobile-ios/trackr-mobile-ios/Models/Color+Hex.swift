//
//  Color+Hex.swift
//  trackr-mobile-ios
//

import SwiftUI
import UIKit

extension Color {
    /// Web theme tokens (web/src/app.css `--bg` / `--surface` / `--border`),
    /// oklch converted to sRGB once, switching with the appearance like the
    /// web's dark/light themes.
    static let webBackground = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0x0C / 255, green: 0x0D / 255, blue: 0x0F / 255, alpha: 1)
            : UIColor(red: 0xFB / 255, green: 0xFA / 255, blue: 0xF8 / 255, alpha: 1)
    })
    static let webSurface = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0x18 / 255, green: 0x19 / 255, blue: 0x1D / 255, alpha: 1)
            : UIColor(red: 0xF1 / 255, green: 0xF0 / 255, blue: 0xEE / 255, alpha: 1)
    })
    static let webBorder = Color(uiColor: UIColor { traits in
        traits.userInterfaceStyle == .dark
            ? UIColor(red: 0x28 / 255, green: 0x2A / 255, blue: 0x2E / 255, alpha: 1)
            : UIColor(red: 0xDC / 255, green: 0xDA / 255, blue: 0xD8 / 255, alpha: 1)
    })
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

    /// Server color strings: orgs/projects/tags send `#rrggbb`, the display
    /// directories derive user colors as `hsl(H 55% 60%)`. Anything else
    /// falls back to the provided default so a bad value never crashes UI.
    init(css: String?, default fallback: Color = Color(hex: 0x9AA4B2)) {
        guard let raw = css?.trimmingCharacters(in: .whitespaces), !raw.isEmpty else {
            self = fallback
            return
        }
        if raw.hasPrefix("#") {
            var hexText = String(raw.dropFirst())
            if hexText.count == 3 { hexText = hexText.map { "\($0)\($0)" }.joined() }
            if let value = UInt32(hexText, radix: 16), hexText.count == 6 {
                self = Color(hex: value)
                return
            }
        }
        if raw.lowercased().hasPrefix("hsl") {
            let numbers = raw
                .split(whereSeparator: { !"0123456789.".contains($0) })
                .compactMap { Double($0) }
            if numbers.count >= 3 {
                let hsb = Self.hslToBrightness(saturation: numbers[1] / 100, lightness: numbers[2] / 100)
                self = Color(hue: numbers[0] / 360, saturation: hsb.saturation, brightness: hsb.brightness)
                return
            }
        }
        self = fallback
    }

    /// HSL (CSS) → HSB (SwiftUI) conversion for the saturation/brightness pair.
    private static func hslToBrightness(saturation s: Double, lightness l: Double)
        -> (saturation: Double, brightness: Double)
    {
        let brightness = l + s * min(l, 1 - l)
        let outSaturation = brightness == 0 ? 0 : 2 * (1 - l / brightness)
        return (outSaturation, brightness)
    }
}
