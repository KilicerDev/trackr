//
//  PushRegistrar.swift
//  trackr-mobile-ios
//
//  APNs registration: ask permission after sign-in, register the device
//  token with POST /api/v1/push/tokens (the server's push.send job resolves
//  tokens at delivery time), deregister on sign-out. Doubles as the app
//  delegate because token callbacks only arrive there.
//

import SwiftUI
import UserNotifications

final class PushRegistrar: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    private static let tokenKey = "trackr.pushToken"

    private var client: APIClient?
    /// Wired by RootView once the session is ready — receives the `url`
    /// custom key of a tapped push for in-app deep-linking.
    @MainActor var onOpen: ((String) -> Void)?
    /// A tap that arrived before the session was ready (cold start).
    @MainActor private var pendingURL: String?

    @MainActor
    func consumePendingURL() -> String? {
        defer { pendingURL = nil }
        return pendingURL
    }

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        return true
    }

    /// Called once a session is ready: request permission (first time) and
    /// (re-)register — APNs tokens can rotate, so this runs every launch.
    func enable(client: APIClient) {
        self.client = client
        Task {
            let center = UNUserNotificationCenter.current()
            let granted = (try? await center.requestAuthorization(options: [.alert, .badge, .sound]))
                ?? false
            guard granted else { return }
            await MainActor.run {
                UIApplication.shared.registerForRemoteNotifications()
            }
        }
    }

    /// Sign-out: remove this device's token server-side and locally.
    func disable() {
        let client = self.client
        self.client = nil
        guard let token = UserDefaults.standard.string(forKey: Self.tokenKey) else { return }
        UserDefaults.standard.removeObject(forKey: Self.tokenKey)
        Task {
            await client?.unregisterPushToken(token)
        }
    }

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        UserDefaults.standard.set(token, forKey: Self.tokenKey)
        guard let client else { return }
        Task {
            try? await client.registerPushToken(token, deviceName: UIDevice.current.name)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        // Simulator or missing entitlement — nothing actionable at runtime.
    }

    /// Show banners for pushes that arrive while the app is foregrounded —
    /// the SSE stream already refreshes the data underneath.
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification
    ) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }

    /// Tap on a notification: deep-link to the entity the push names via
    /// its `url` custom key (set by the server's push payload).
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse
    ) async {
        guard
            let url = response.notification.request.content.userInfo["url"] as? String,
            !url.isEmpty
        else { return }
        await MainActor.run {
            if let onOpen {
                onOpen(url)
            } else {
                pendingURL = url
            }
        }
    }
}
