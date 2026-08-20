//
//  Taxonomy.swift
//  trackr-mobile-ios
//
//  Mirror of web/src/lib/config/taxonomy.ts — labels and colors must stay
//  in sync with the web app.
//

import SwiftUI

enum TaskStatus: String, CaseIterable, Identifiable {
    case backlog, todo, inProgress, paused, inReview, done

    var id: String { rawValue }

    var label: String {
        switch self {
        case .backlog: "Backlog"
        case .todo: "Todo"
        case .inProgress: "In Progress"
        case .paused: "Paused"
        case .inReview: "In Review"
        case .done: "Done"
        }
    }

    var color: Color {
        switch self {
        case .backlog: Color(hex: 0x7C7C84)
        case .todo: Color(hex: 0x9AA4B2)
        case .inProgress: Color(hex: 0xF0A85C)
        case .paused: Color(hex: 0xE9C46A)
        case .inReview: Color(hex: 0xB591E3)
        case .done: Color(hex: 0x7FC8A9)
        }
    }
}

enum TaskPriority: String, CaseIterable, Identifiable {
    case none, low, medium, high, urgent

    var id: String { rawValue }

    var label: String {
        switch self {
        case .none: "None"
        case .low: "Low"
        case .medium: "Medium"
        case .high: "High"
        case .urgent: "Urgent"
        }
    }

    /// Number of lit bars in the priority indicator (0–4, web parity).
    var bars: Int {
        switch self {
        case .none: 0
        case .low: 1
        case .medium: 2
        case .high: 3
        case .urgent: 4
        }
    }

    var color: Color {
        switch self {
        case .none: Color(hex: 0x5B5B62)
        case .low: Color(hex: 0x7A9CF0)
        case .medium: Color(hex: 0xF0A85C)
        case .high: Color(hex: 0xEF7A6D)
        case .urgent: Color(hex: 0xEF4F5E)
        }
    }
}

enum TaskType: String, CaseIterable, Identifiable {
    case task, bug, improvement, feature, chore

    var id: String { rawValue }

    var label: String {
        switch self {
        case .task: "Task"
        case .bug: "Bug"
        case .improvement: "Improvement"
        case .feature: "Feature"
        case .chore: "Chore"
        }
    }

    var color: Color {
        switch self {
        case .task: Color(hex: 0x7A9CF0)
        case .bug: Color(hex: 0xEF7A6D)
        case .improvement: Color(hex: 0xEF7A6D)
        case .feature: Color(hex: 0x7FC8A9)
        case .chore: Color(hex: 0xC08BD6)
        }
    }

    var systemImage: String {
        switch self {
        case .task: "square"
        case .bug: "ladybug"
        case .improvement: "triangle"
        case .feature: "sparkle"
        case .chore: "gearshape"
        }
    }
}

enum DueTone {
    case overdue, urgent, soon, normal

    var color: Color? {
        switch self {
        case .overdue: Color(hex: 0xEF4F5E)
        case .urgent: .accentColor
        case .soon: Color(hex: 0xD8A24A)
        case .normal: nil
        }
    }
}

/// Mirror of web TICKET_STATUSES in taxonomy.ts.
enum TicketStatus: String, CaseIterable, Identifiable {
    case open, inProgress, waitingOnCustomer, waitingOnAgent, paused, resolved, closed

    var id: String { rawValue }

    var label: String {
        switch self {
        case .open: "Open"
        case .inProgress: "In Progress"
        case .waitingOnCustomer: "Waiting on customer"
        case .waitingOnAgent: "Waiting on agent"
        case .paused: "Paused"
        case .resolved: "Resolved"
        case .closed: "Closed"
        }
    }

    var color: Color {
        switch self {
        case .open: Color(hex: 0x7A9CF0)
        case .inProgress: Color(hex: 0xF0A85C)
        case .waitingOnCustomer: Color(hex: 0xB591E3)
        case .waitingOnAgent: Color(hex: 0xEF7A6D)
        case .paused: Color(hex: 0xE9C46A)
        case .resolved: Color(hex: 0x7FC8A9)
        case .closed: Color(hex: 0x7C7C84)
        }
    }

    var isClosed: Bool { self == .resolved || self == .closed }
}

/// Mirror of web TICKET_CATEGORIES in taxonomy.ts.
enum TicketCategory: String, CaseIterable, Identifiable {
    case general, billing, technicalIssue, featureRequest

    var id: String { rawValue }

    var label: String {
        switch self {
        case .general: "General"
        case .billing: "Billing"
        case .technicalIssue: "Technical issue"
        case .featureRequest: "Feature request"
        }
    }

    var color: Color {
        switch self {
        case .general: Color(hex: 0x9AA4B2)
        case .billing: Color(hex: 0xE9C46A)
        case .technicalIssue: Color(hex: 0xEF7A6D)
        case .featureRequest: Color(hex: 0x7FC8A9)
        }
    }
}

/// Mirror of web TICKET_CHANNELS in taxonomy.ts.
enum TicketChannel: String, CaseIterable, Identifiable {
    case webForm, email, chat, api

    var id: String { rawValue }

    var label: String {
        switch self {
        case .webForm: "Web form"
        case .email: "Email"
        case .chat: "Chat"
        case .api: "API"
        }
    }

    var systemImage: String {
        switch self {
        case .webForm: "globe"
        case .email: "envelope"
        case .chat: "bubble.left.and.bubble.right"
        case .api: "terminal"
        }
    }
}

extension TaskPriority {
    /// Tickets reuse the trackr priorities minus 'none' — every ticket has
    /// a priority (web parity: TICKET_PRIORITIES).
    static var ticketCases: [TaskPriority] {
        allCases.filter { $0 != .none }
    }
}

/// Estimate presets (minutes) shared by the create sheet and detail view.
enum EstimateOptions {
    static let all: [(minutes: Int?, label: String)] = [
        (nil, "None"), (15, "15m"), (30, "30m"), (60, "1h"),
        (120, "2h"), (180, "3h"), (240, "4h"), (360, "6h"), (480, "1d"),
    ]
}

/// Mirror of web PROJECT_STATUS in taxonomy.ts.
enum ProjectStatus: String, CaseIterable, Identifiable {
    case prospect, planned, active, paused, completed, cancelled, archived

    var id: String { rawValue }

    var label: String {
        switch self {
        case .prospect: "Prospect"
        case .planned: "Planned"
        case .active: "Active"
        case .paused: "Paused"
        case .completed: "Completed"
        case .cancelled: "Cancelled"
        case .archived: "Archived"
        }
    }

    var color: Color {
        switch self {
        case .prospect: Color(hex: 0xC08BD6)
        case .planned: Color(hex: 0x7A9CF0)
        case .active: Color(hex: 0x7FC8A9)
        case .paused: Color(hex: 0x9AA4B2)
        case .completed: Color(hex: 0x7C9B86)
        case .cancelled: Color(hex: 0xEF7A6D)
        case .archived: Color(hex: 0x9AA4B2)
        }
    }
}
