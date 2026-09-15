//
//  TKTheme.swift
//  trackr-mobile-ios
//
//  Design tokens for the trackr mobile UI (Claude Design prototype
//  "Trackr Mobile", 2026-09-14). Dark is the primary theme — every value
//  below is the prototype's dark value with a derived light counterpart so
//  the Theme setting (System / Light / Dark) works everywhere.
//
//  Rules of thumb:
//    • page = TK.bg, group header bands = TK.bgRaised, cards/chips = TK.card
//    • everything is separated by hairlines (TK.hairline / TK.border), never
//      by shadows — the only shadow in the system is the create button glow
//    • keys, counts, times and dates are mono (Font.tkMono)
//    • section labels are 11pt semibold uppercase with 0.1em tracking
//

import SwiftUI
import UIKit

enum TK {
    // MARK: Surfaces

    /// Page background (#0b0c0f).
    static let bg = dyn(dark: 0x0B0C0F, light: 0xF7F6F4)
    /// Group header bands, the "one step up" surface (#0f1013).
    static let bgRaised = dyn(dark: 0x0F1013, light: 0xF1F0EE)
    /// Cards, chips, toolbar buttons, sheets (#14151a).
    static let card = dyn(dark: 0x14151A, light: 0xFFFFFF)
    /// Pressed state of a card/row (#1b1c22).
    static let cardActive = dyn(dark: 0x1B1C22, light: 0xF1F0EE)
    /// Floating menus / popovers (#1a1b21).
    static let popover = dyn(dark: 0x1A1B21, light: 0xFFFFFF)
    /// Toasts, secondary buttons on sheets (#1f2027).
    static let elevated = dyn(dark: 0x1F2027, light: 0xF1F0EE)
    /// Round control faces on the session sheet (#26272f).
    static let elevated2 = dyn(dark: 0x26272F, light: 0xE9E8E6)
    /// Bottom-sheet body for the create sheet (#0f1013) — sits between bg
    /// and card so its chips still read.
    static let sheetLow = bgRaised

    // MARK: Lines

    /// Row separators inside lists (white 5%).
    static let hairline = mono(0.05)
    /// Separators between sections / group bands (white 6%).
    static let hairlineStrong = mono(0.06)
    /// Card and chip outlines (white 8%).
    static let border = mono(0.08)
    /// Outlines of interactive chips and inputs (white 10%).
    static let borderStrong = mono(0.10)
    /// Focused inputs, popovers (white 12%).
    static let borderInput = mono(0.12)
    /// Dashed "add" outlines (white 18–22%).
    static let borderDashed = mono(0.20)

    // MARK: Text

    /// Primary text (#f3f3f5).
    static let text = dyn(dark: 0xF3F3F5, light: 0x111114)
    /// Body copy in descriptions (white 75%).
    static let textBody = mono(0.75)
    /// Secondary labels, values (white 60%).
    static let text2 = mono(0.60)
    /// Meta: keys, counts, dates (white 45%).
    static let text3 = mono(0.45)
    /// Section labels, placeholders (white 35%).
    static let text4 = mono(0.35)
    /// Ghost text, unlit indicators (white 25%).
    static let text5 = mono(0.25)

    // MARK: Accent & semantic

    /// The trackr red — the AccentColor asset (#ff4867, web parity).
    static let accent = Color.accentColor
    /// Accent-tinted fills (selected chips, badges).
    static let accentSoft = Color.accentColor.opacity(0.12)
    static let accentSofter = Color.accentColor.opacity(0.16)
    /// Accent outlines on selected chips.
    static let accentBorder = Color.accentColor.opacity(0.4)
    /// Disabled primary buttons.
    static let accentDisabled = Color.accentColor.opacity(0.35)

    /// Done / success (#4cc38a).
    static let success = Color(hex: 0x4CC38A)
    /// Internal-note amber (#d4b13d) — matches the web's internal treatment.
    static let amber = Color(hex: 0xD4B13D)
    /// Paused session (#e0a03a).
    static let warning = Color(hex: 0xE0A03A)
    /// Overdue / destructive (#ef4f5e — taxonomy urgent).
    static let danger = Color(hex: 0xEF4F5E)
    /// Tag chip tint (#8db0f5 on rgba(91,141,239,0.15)).
    static let tagText = Color(hex: 0x8DB0F5)
    static let tagFill = Color(hex: 0x5B8DEF).opacity(0.15)

    // MARK: Radii

    static let rSheet: CGFloat = 28
    static let rCard: CGFloat = 16
    static let rCardSm: CGFloat = 14
    static let rPanel: CGFloat = 18
    static let rToolbar: CGFloat = 12
    static let rChip: CGFloat = 10
    static let rSegment: CGFloat = 9
    static let rSegmentItem: CGFloat = 7
    static let rButton: CGFloat = 11
    static let rInput: CGFloat = 14

    // MARK: Layout

    /// Horizontal page gutter.
    static let gutter: CGFloat = 16
    /// Height of the custom tab bar content (above the home indicator).
    static let tabBarHeight: CGFloat = 58
    /// Height of the session mini bar.
    static let miniBarHeight: CGFloat = 54

    // MARK: Helpers

    /// Dark/light pair, switching with the interface style.
    nonisolated static func dyn(dark: UInt32, light: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(hex: dark) : UIColor(hex: light)
        })
    }

    /// White-with-alpha in dark, black-with-alpha in light — the prototype
    /// builds every line and secondary text this way.
    nonisolated static func mono(_ alpha: CGFloat) -> Color {
        Color(uiColor: UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor.white.withAlphaComponent(alpha)
                : UIColor.black.withAlphaComponent(alpha)
        })
    }

    /// Icon/status tile background: `color + 1f` in the prototype.
    nonisolated static func tint(_ color: Color) -> Color { color.opacity(0.12) }
    /// Icon/status tile outline: `color + 55`.
    nonisolated static func tintBorder(_ color: Color) -> Color { color.opacity(0.33) }
}

extension UIColor {
    convenience init(hex: UInt32) {
        self.init(
            red: CGFloat((hex >> 16) & 0xFF) / 255,
            green: CGFloat((hex >> 8) & 0xFF) / 255,
            blue: CGFloat(hex & 0xFF) / 255,
            alpha: 1
        )
    }
}

// MARK: - Typography

extension Font {
    /// SF Mono for keys, counts, dates, timers.
    static func tkMono(_ size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }

    /// 28pt bold page title ("My week", "Tickets").
    static let tkPageTitle = Font.system(size: 28, weight: .bold)
    /// 22pt bold detail title.
    static let tkDetailTitle = Font.system(size: 22, weight: .bold)
    /// 17pt semibold sheet title.
    static let tkSheetTitle = Font.system(size: 17, weight: .semibold)
    /// 15pt row title.
    static let tkRow = Font.system(size: 15)
    /// 15pt bold group name.
    static let tkGroup = Font.system(size: 15, weight: .bold)
    /// 14pt medium chip label.
    static let tkChip = Font.system(size: 14, weight: .medium)
    /// 13pt medium toolbar button label.
    static let tkToolbar = Font.system(size: 13, weight: .medium)
    /// 11pt semibold section label (apply `.tkTracking()` + uppercase).
    static let tkSection = Font.system(size: 11, weight: .semibold)
    /// 12pt meta line.
    static let tkMeta = Font.system(size: 12)
    /// 11pt meta line.
    static let tkMetaSm = Font.system(size: 11)
}

extension Text {
    /// Page/detail title letter-spacing (-0.02em at 28pt ≈ -0.5pt).
    func tkTitleTracking() -> Text { tracking(-0.5) }
}
