//
//  WorkSessionAttributes.swift
//  Shared (app + Live Activity extension)
//
//  The Live Activity contract for a running work session. Static
//  attributes describe what is being worked on; the content state carries
//  the bits that change while the session runs. The timer itself needs no
//  updates — the views count up from `startedAt` on their own.
//

import ActivityKit
import Foundation

struct WorkSessionAttributes: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// Timer origin — the session start shifted by the pauses, so the
        /// count-up shows working time.
        var startedAt: Date
        /// Set while paused: the views show the frozen elapsed time
        /// (`pausedAt - startedAt`) instead of a running timer.
        var pausedAt: Date?
        /// Session title — editable for free sessions, so it lives in state.
        var title: String
        var noteCount: Int
    }

    var projectName: String
    /// sRGB hex (0xRRGGBB) — `Color` isn't Codable, and the extension
    /// rebuilds it with the shared `Color(hex:)`.
    var projectColorHex: UInt32
    /// Bound sessions: the task key ("TRK-112"); nil for free sessions.
    var taskKey: String?
    /// The session's real start — identifies the activity across relaunches.
    var sessionStartedAt: Date?

    var projectInitial: String { String(projectName.prefix(1)) }
}

extension WorkSessionAttributes {
    /// The URL the activity opens the app with: straight to the player.
    static let openURL = URL(string: "trackr://session")!
}
