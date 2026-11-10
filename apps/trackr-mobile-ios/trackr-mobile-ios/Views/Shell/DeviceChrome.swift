//
//  DeviceChrome.swift
//  trackr-mobile-ios
//
//  Where the system wants the app's bars. On iPhone Duo (folded) iOS 27.1
//  reserves a vertical strip on the trailing edge — the "vertical bar" —
//  and hosts the status cluster, the tab bar and navigation items there,
//  for apps that use the system bars. The shell draws its own bars on
//  regular phones; when a vertical bar exists it switches to a system
//  TabView so iOS fills the strip (tabs, back button, fold animation).
//
//  The signal is `UITraitCollection.verticalBarEdge`, which SwiftUI does
//  not expose — read through a UIKit probe view and published as an
//  Observable. nil on devices without a vertical bar.
//

import SwiftUI
import UIKit

@Observable @MainActor
final class DeviceChrome {
    /// Edge the system reserves for a vertical bar; nil on regular phones.
    var railEdge: HorizontalEdge?

    var hasRail: Bool { railEdge != nil }
}

/// UIKit probe that feeds `DeviceChrome`. Place it as the root's background.
struct DeviceChromeReader: UIViewRepresentable {
    let chrome: DeviceChrome

    func makeUIView(context: Context) -> ProbeView {
        let view = ProbeView()
        view.chrome = chrome
        view.isUserInteractionEnabled = false
        view.backgroundColor = .clear
        return view
    }

    func updateUIView(_ uiView: ProbeView, context: Context) {}

    final class ProbeView: UIView {
        weak var chrome: DeviceChrome?

        override init(frame: CGRect) {
            super.init(frame: frame)
            if #available(iOS 27.1, *) {
                registerForTraitChanges(UITraitCollection.systemTraitsAffectingVerticalBarEdge) {
                    (view: ProbeView, _) in view.publish()
                }
            }
        }

        @available(*, unavailable)
        required init?(coder: NSCoder) { fatalError() }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            publish()
        }

        private func publish() {
            guard let chrome else { return }
            var edge: HorizontalEdge?
            if #available(iOS 27.1, *) {
                let rtl = traitCollection.layoutDirection == .rightToLeft
                switch traitCollection.verticalBarEdge {
                case .leading: edge = rtl ? .trailing : .leading
                case .trailing: edge = rtl ? .leading : .trailing
                default: edge = nil
                }
            }
            if chrome.railEdge != edge { chrome.railEdge = edge }
        }
    }
}
