//
//  SessionStore.swift
//  trackr-mobile-ios
//
//  Persists the running work session so it survives the process: iOS may
//  kill the app in the background while the Live Activity keeps counting,
//  and the next launch must pick the session back up — not start over.
//

import Foundation
import SwiftUI

enum SessionStore {
    private static let key = "trackr.workSession"

    /// Storable shape — `Color`/`UserRef` aren't Codable, so the project is
    /// kept as name + hex and notes as text + date (the author is always
    /// the current user).
    private struct Snapshot: Codable {
        var projectName: String
        var projectColorHex: UInt32
        var title: String
        var startedAt: Date
        var taskId: String?
        var notes: [Note]

        struct Note: Codable {
            var id: String
            var date: Date
            var text: String
        }
    }

    static func save(_ session: WorkSession) {
        guard let project = session.project, let startedAt = session.startedAt else {
            UserDefaults.standard.removeObject(forKey: key)
            return
        }
        let snapshot = Snapshot(
            projectName: project.name,
            projectColorHex: project.color.hexValue,
            title: session.title,
            startedAt: startedAt,
            taskId: session.taskId,
            notes: session.notes.map { .init(id: $0.id, date: $0.date, text: $0.text) }
        )
        if let data = try? JSONEncoder().encode(snapshot) {
            UserDefaults.standard.set(data, forKey: key)
        }
    }

    static func restore(author: UserRef) -> WorkSession? {
        guard let data = UserDefaults.standard.data(forKey: key),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data)
        else { return nil }
        return WorkSession(
            project: ProjectRef(name: snapshot.projectName, color: Color(hex: snapshot.projectColorHex)),
            title: snapshot.title,
            startedAt: snapshot.startedAt,
            notes: snapshot.notes.map { TaskComment(id: $0.id, user: author, date: $0.date, text: $0.text) },
            taskId: snapshot.taskId
        )
    }
}
