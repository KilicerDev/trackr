//
//  SessionActivityController.swift
//  trackr-mobile-ios
//
//  Owns the work-session Live Activity: starts it with the session, keeps
//  title / note count current, ends it when the session ends, and clears
//  orphans left behind by a crash. Also hands the activity's push token to
//  the server so a web-side "stop session" can end it later.
//

import ActivityKit
import Foundation

@MainActor
final class SessionActivityController {
    private let client: APIClient?
    private var activity: Activity<WorkSessionAttributes>?
    private var tokenTask: Task<Void, Never>?

    init(client: APIClient?) {
        self.client = client
    }

    /// Whether the system lets this app show Live Activities at all.
    var isAvailable: Bool {
        ActivityAuthorizationInfo().areActivitiesEnabled
    }

    /// App launch: an activity without a running session is a leftover
    /// from a killed process — take it down instead of letting it linger
    /// for hours on the lock screen.
    func endOrphans() {
        for stale in Activity<WorkSessionAttributes>.activities {
            Task { await stale.end(nil, dismissalPolicy: .immediate) }
        }
        activity = nil
    }

    func start(_ session: WorkSession) {
        guard isAvailable, activity == nil,
              let project = session.project, let startedAt = session.startedAt
        else { return }
        let attributes = WorkSessionAttributes(
            projectName: project.name,
            projectColorHex: project.color.hexValue,
            taskKey: session.taskId
        )
        let content = ActivityContent(state: state(for: session, startedAt: startedAt), staleDate: nil)
        do {
            let started = try Activity.request(
                attributes: attributes, content: content, pushType: .token
            )
            activity = started
            observePushToken(of: started)
        } catch {
            // No lock-screen banner — the in-app player still works.
        }
    }

    /// Title / notes changed — the clock never needs this.
    func update(_ session: WorkSession) {
        guard let activity, let startedAt = session.startedAt else { return }
        let next = state(for: session, startedAt: startedAt)
        guard next != activity.content.state else { return }
        Task { await activity.update(ActivityContent(state: next, staleDate: nil)) }
    }

    func end() {
        guard let activity else { return }
        self.activity = nil
        tokenTask?.cancel()
        tokenTask = nil
        let finalState = activity.content.state
        let token = activity.pushToken?.hexString
        Task {
            await activity.end(ActivityContent(state: finalState, staleDate: nil), dismissalPolicy: .immediate)
            if let token { await client?.unregisterPushToken(token) }
        }
    }

    // MARK: - Private

    private func state(for session: WorkSession, startedAt: Date) -> WorkSessionAttributes.ContentState {
        .init(startedAt: startedAt, title: session.title, noteCount: session.notes.count)
    }

    /// Per-activity APNs token (rotates): registered with the server under
    /// its own platform so the device-push sender never targets it.
    private func observePushToken(of activity: Activity<WorkSessionAttributes>) {
        tokenTask?.cancel()
        tokenTask = Task { [client] in
            for await token in activity.pushTokenUpdates {
                try? await client?.registerPushToken(
                    token.hexString, platform: .liveActivity, deviceName: nil
                )
            }
        }
    }
}

private extension Data {
    var hexString: String { map { String(format: "%02x", $0) }.joined() }
}
