//
//  TrackrLiveBundle.swift
//  trackr-mobile-ios-live
//
//  Widget-extension entry point. Only the work-session Live Activity for
//  now; home-screen widgets would register here as well.
//

import SwiftUI
import WidgetKit

@main
struct TrackrLiveBundle: WidgetBundle {
    var body: some Widget {
        WorkSessionLiveActivity()
    }
}
