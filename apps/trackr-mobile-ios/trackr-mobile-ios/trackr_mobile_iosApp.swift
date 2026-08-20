//
//  trackr_mobile_iosApp.swift
//  trackr-mobile-ios
//
//  Created by Ertugul Kilic on 19.08.26.
//

import SwiftUI

@main
struct trackr_mobile_iosApp: App {
    @UIApplicationDelegateAdaptor(PushRegistrar.self) private var pushRegistrar

    var body: some Scene {
        WindowGroup {
            RootView(push: pushRegistrar)
        }
    }
}
