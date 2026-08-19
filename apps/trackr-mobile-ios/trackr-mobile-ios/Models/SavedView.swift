//
//  SavedView.swift
//  trackr-mobile-ios
//
//  A named, pre-defined filter configuration — the mobile counterpart of
//  the web's saved views (ViewsMenu).
//

import SwiftUI

struct SavedView: Identifiable {
    let name: String
    let icon: String
    let filters: TaskFilters

    var id: String { name }

    /// Short human summary of what the view shows.
    var summary: String {
        var parts: [String] = []
        if !filters.statuses.isEmpty {
            parts.append(filters.statuses.map(\.label).sorted().joined(separator: ", "))
        }
        if !filters.priorities.isEmpty {
            parts.append(filters.priorities.map(\.label).sorted().joined(separator: " & "))
        }
        if !filters.assignees.isEmpty {
            parts.append(filters.assignees.map(\.name).sorted().joined(separator: ", "))
        }
        if !filters.projects.isEmpty {
            parts.append(filters.projects.sorted().joined(separator: ", "))
        }
        if filters.window != .month {
            parts.append(filters.window.label)
        }
        if filters.group != .status {
            parts.append("by \(filters.group.label.lowercased())")
        }
        return parts.isEmpty ? "All tasks" : parts.joined(separator: " · ")
    }
}

// MARK: - Sample data (UI design phase only — synced with the server later)

extension SavedView {
    static let samples: [SavedView] = [
        SavedView(name: "Urgent work", icon: "flame",
                  filters: {
                      var f = TaskFilters()
                      f.priorities = [.high, .urgent]
                      return f
                  }()),
        SavedView(name: "My tasks", icon: "person.crop.circle",
                  filters: {
                      var f = TaskFilters()
                      f.assignees = [TaskItem.sampleUsers[0]]
                      f.group = .project
                      return f
                  }()),
        SavedView(name: "This week", icon: "calendar",
                  filters: {
                      var f = TaskFilters()
                      f.window = .week
                      return f
                  }()),
        SavedView(name: "Mobile app", icon: "iphone",
                  filters: {
                      var f = TaskFilters()
                      f.projects = ["Mobile App"]
                      return f
                  }()),
        SavedView(name: "Everything", icon: "tray.full",
                  filters: {
                      var f = TaskFilters()
                      f.window = .all
                      return f
                  }()),
    ]
}
