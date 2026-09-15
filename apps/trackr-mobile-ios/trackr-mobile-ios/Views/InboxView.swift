//
//  InboxView.swift
//  trackr-mobile-ios
//
//  The user's notification feed (/api/v1/inbox) — cursor-paged, newest
//  first, with mark-all-read and an All / Unread switch. Rows resolve into
//  loaded entities so a tap jumps straight to the ticket/task/thread on
//  its own tab (DESIGN.md §5 "Inbox").
//

import SwiftUI

struct InboxView: View {
    @Bindable var model: AppModel

    private enum Filter: Hashable { case all, unread }

    @State private var items: [API.InboxItem] = []
    @State private var actors: [String: API.DisplayUser] = [:]
    @State private var nextCursor: String?
    @State private var isLoading = false
    @State private var filter: Filter = .all

    private var unreadCount: Int { items.count { $0.readAt == nil } }

    private var visible: [API.InboxItem] {
        filter == .unread ? items.filter { $0.readAt == nil } : items
    }

    var body: some View {
        NavigationStack(path: $model.inboxPath) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    TKPageHeader("Inbox") {
                        TKQuietButton(title: "Mark all read", color: TK.accent, weight: .medium, action: markAllRead)
                            .disabled(unreadCount == 0)
                            .opacity(unreadCount == 0 ? 0.4 : 1)
                    }

                    HStack {
                        TKSegmented([Filter.all, .unread], selection: $filter) { option in
                            switch option {
                            case .all: "All"
                            case .unread: unreadCount > 0 ? "Unread \(unreadCount)" : "Unread"
                            }
                        }
                        Spacer()
                    }
                    .padding(.horizontal, TK.gutter)
                    .padding(.top, 6)
                    .padding(.bottom, 10)

                    ForEach(visible, id: \.id) { item in
                        TKHairline()
                        Button {
                            open(item)
                        } label: {
                            InboxRow(item: item, actor: actor(for: item), target: target(for: item))
                        }
                        .buttonStyle(TKPressStyle())
                    }
                    if !visible.isEmpty {
                        TKHairline()
                    }

                    if visible.isEmpty {
                        if isLoading {
                            ProgressView()
                                .tint(TK.text3)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 60)
                        } else {
                            TKEmptyState(text: filter == .unread && !items.isEmpty
                                ? "No unread notifications."
                                : "You're all caught up.")
                        }
                    }

                    if let nextCursor, filter == .all {
                        TKQuietButton(title: "Show older", color: TK.text2, weight: .medium) {
                            Task { await load(cursor: nextCursor) }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 10)
                    }
                }
                .padding(.bottom, 24)
            }
            .refreshable { await load(cursor: nil) }
            .tkRootScreen(model)
            .navigationDestination(for: ChatThread.self) { thread in
                ChatThreadView(model: model, threadId: thread.id)
                    .tkDetailScreen()
            }
            .task { await load(cursor: nil) }
        }
    }

    // MARK: - Resolution

    private func actor(for item: API.InboxItem) -> UserRef? {
        Mapper.user(id: item.actorId, in: actors)
    }

    /// Loaded entity behind the notification, for the KEY + navigation.
    private func target(for item: API.InboxItem) -> InboxTarget? {
        switch item.entityType {
        case "ticket":
            if let ticket = model.tickets.first(where: { $0.uuid == item.entityId }) {
                return .ticket(ticket)
            }
        case "task":
            if let task = model.tasks.first(where: { $0.uuid == item.entityId }) {
                return .task(task)
            }
        case "thread":
            if let thread = model.chatThreads.first(where: { $0.id == item.entityId }) {
                return .thread(thread)
            }
        default:
            break
        }
        return nil
    }

    private func open(_ item: API.InboxItem) {
        switch target(for: item) {
        case .task(let task): model.open(task)
        case .ticket(let ticket): model.open(ticket)
        case .thread(let thread): model.inboxPath.append(thread)
        case nil:
            // Not loaded yet (older entity) — the server route fetches it.
            guard !item.url.isEmpty else { return }
            model.handlePushURL(item.url)
        }
    }

    // MARK: - Loading & read state

    private func markAllRead() {
        model.sync?.markInboxAllRead()
        items = items.map { read($0) }
    }

    private func read(_ item: API.InboxItem) -> API.InboxItem {
        API.InboxItem(
            id: item.id, kind: item.kind, title: item.title, body: item.body,
            url: item.url, actorId: item.actorId, entityType: item.entityType,
            entityId: item.entityId, readAt: item.readAt ?? APIDate.dayString(.now),
            createdAt: item.createdAt
        )
    }

    private func load(cursor: String?) async {
        guard let sync = model.sync else {
            // Design work / simulator screenshots: the bundled feed.
            if ProcessInfo.processInfo.arguments.contains("--sample-data") {
                items = API.InboxItem.samples
                actors = API.InboxItem.sampleActors
            }
            return
        }
        isLoading = true
        defer { isLoading = false }
        guard let page = await sync.fetchInbox(cursor: cursor) else { return }
        actors.merge(page.actors) { _, fresh in fresh }
        if cursor == nil {
            items = page.items
        } else {
            items.append(contentsOf: page.items)
        }
        nextCursor = page.nextCursor
        await sync.refreshBadge()
    }
}

/// The loaded entity an inbox row points at.
enum InboxTarget {
    case task(TaskItem)
    case ticket(TicketItem)
    case thread(ChatThread)

    var key: String? {
        switch self {
        case .task(let task): task.id
        case .ticket(let ticket): ticket.id
        case .thread: nil
        }
    }
}

// MARK: - Row

/// 6pt unread dot · avatar 34 · "who action" + time · KEY + target ·
/// optional quote. The server title is "<event phrase> — <entity label>"
/// (or "phrase: label"); the phrase becomes the action line, the label the
/// target, and the display id inside it the mono KEY.
struct InboxRow: View {
    let item: API.InboxItem
    var actor: UserRef? = nil
    var target: InboxTarget? = nil

    private var unread: Bool { item.readAt == nil }

    private var parts: (action: String, target: String, key: String?) {
        Self.split(item.title, fallbackKey: target?.key)
    }

    private var time: String {
        APIDate.parse(item.createdAt)?.relativeShort ?? ""
    }

    var body: some View {
        let parts = parts
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(unread ? TK.accent : .clear)
                .frame(width: 6, height: 6)
                .padding(.top, 14)

            if let actor {
                AvatarView(user: actor, size: 34)
            } else {
                Image(systemName: "bell.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(TK.text2)
                    .frame(width: 34, height: 34)
                    .background(TK.elevated, in: .circle)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    actionLine(parts.action)
                        .font(.system(size: 13))
                        .foregroundStyle(unread ? TK.text2 : TK.text3)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    Text(time)
                        .font(.system(size: 12))
                        .foregroundStyle(TK.text4)
                }
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if let key = parts.key {
                        Text(key)
                            .font(.tkMono(11))
                            .foregroundStyle(TK.text3)
                    }
                    Text(parts.target)
                        .font(.tkRow)
                        .foregroundStyle(unread ? TK.text : TK.text2)
                        .lineLimit(1)
                }
                if let body = item.body?.trimmingCharacters(in: .whitespacesAndNewlines), !body.isEmpty {
                    Text("“\(body)”")
                        .font(.system(size: 13))
                        .foregroundStyle(TK.text2)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }
        }
        .padding(.horizontal, TK.gutter)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(.rect)
    }

    /// "**Mara** New comment on" — the actor in medium weight when known.
    private func actionLine(_ action: String) -> Text {
        if let actor {
            return Text(actor.name).fontWeight(.semibold).foregroundStyle(unread ? TK.text : TK.text2)
                + Text(" \(action)")
        }
        return Text(action)
    }

    static func split(_ title: String, fallbackKey: String?) -> (action: String, target: String, key: String?) {
        var action = title
        var target = ""
        if let range = title.range(of: " — ") {
            action = String(title[..<range.lowerBound])
            target = String(title[range.upperBound...])
        } else if let range = title.range(of: ": ") {
            action = String(title[..<range.lowerBound])
            target = String(title[range.upperBound...])
        }
        var key = fallbackKey
        if let match = action.firstMatch(of: #/\b[A-Z][A-Z0-9]+-\d+\b/#) {
            key = key ?? String(match.output)
            action.removeSubrange(match.range)
        } else if key == nil, let match = target.firstMatch(of: #/^[A-Z][A-Z0-9]+-\d+\s*[—:-]?\s*/#) {
            key = String(match.output).trimmingCharacters(in: CharacterSet(charactersIn: " —:-"))
            target.removeSubrange(match.range)
        }
        action = action
            .trimmingCharacters(in: CharacterSet(charactersIn: " :—-"))
            .replacingOccurrences(of: "  ", with: " ")
        if target.isEmpty {
            target = action
            action = ""
        }
        return (action, target.trimmingCharacters(in: .whitespaces), key)
    }
}

// MARK: - Sample data (UI design phase only — the real feed comes from /api/v1/inbox)

extension API.InboxItem {
    static let sampleActors: [String: API.DisplayUser] = [
        "u1": API.DisplayUser(name: "Max Muster", color: "#7A9CF0"),
        "u2": API.DisplayUser(name: "Mara Steiner", color: "#C08BD6"),
        "u3": API.DisplayUser(name: "Jonas Weber", color: "#7FC8A9"),
    ]

    static let samples: [API.InboxItem] = {
        let now = Date.now
        func at(_ seconds: TimeInterval) -> String { now.addingTimeInterval(-seconds).formatted(.iso8601) }
        return [
            API.InboxItem(id: "n1", kind: "task_commented",
                          title: "New comment on TRK-139: Fix Outlook rendering of the digest mail",
                          body: "The VML fallback breaks the rounded corners — can we drop them for Outlook only?",
                          url: "/tasks/TRK-139", actorId: "u2", entityType: "task", entityId: "TRK-139",
                          readAt: nil, createdAt: at(600)),
            API.InboxItem(id: "n2", kind: "ticket_assigned",
                          title: "Assigned to you: SIWEB-14 — Checkout button unresponsive on iOS",
                          body: nil, url: "/tickets/SIWEB-14", actorId: "u3", entityType: "ticket", entityId: "SIWEB-14",
                          readAt: nil, createdAt: at(7200)),
            API.InboxItem(id: "n3", kind: "mentioned",
                          title: "You were mentioned: TRK-142 — Session mini bar on detail screens",
                          body: "@Max can you check whether the Live Activity keeps counting after a pause?",
                          url: "/tasks/TRK-142", actorId: "u1", entityType: "task", entityId: "TRK-142",
                          readAt: nil, createdAt: at(5 * 3600)),
            API.InboxItem(id: "n4", kind: "task_status",
                          title: "TRK-131 → In Review: Saved views on the mobile tasks list",
                          body: nil, url: "/tasks/TRK-131", actorId: "u1", entityType: "task", entityId: "TRK-131",
                          readAt: at(0), createdAt: at(86400)),
            API.InboxItem(id: "n5", kind: "chat_message",
                          title: "New message in Deployment window for the shop relaunch",
                          body: "Friday 18:00 works for us — can you confirm the DNS TTL is lowered?",
                          url: "/chat/4", actorId: nil, entityType: "thread", entityId: "4",
                          readAt: at(0), createdAt: at(3 * 86400)),
        ]
    }()
}

// MARK: - Previews

#Preview("Inbox") {
    InboxView(model: AppModel())
        .preferredColorScheme(.dark)
}

#Preview("Rows") {
    ScrollView {
        VStack(spacing: 0) {
            TKPageHeader("Inbox") {
                TKQuietButton(title: "Mark all read", color: TK.accent, weight: .medium) {}
            }
            ForEach(API.InboxItem.samples, id: \.id) { item in
                TKHairline()
                InboxRow(item: item, actor: Mapper.user(id: item.actorId, in: API.InboxItem.sampleActors))
            }
            TKHairline()
        }
    }
    .background(TK.bg)
    .preferredColorScheme(.dark)
}
