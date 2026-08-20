//
//  InboxView.swift
//  trackr-mobile-ios
//
//  The user's notification feed (/api/v1/inbox) — cursor-paged, newest
//  first, with mark-all-read. Rows resolve into loaded entities so a tap
//  jumps straight to the ticket/task/thread.
//

import SwiftUI

struct InboxView: View {
    @Bindable var model: AppModel

    @State private var items: [API.InboxItem] = []
    @State private var actors: [String: API.DisplayUser] = [:]
    @State private var nextCursor: String?
    @State private var isLoading = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 10) {
                ForEach(items, id: \.id) { item in
                    row(item)
                }
                if items.isEmpty && !isLoading {
                    ContentUnavailableView(
                        "All caught up",
                        systemImage: "bell",
                        description: Text("Notifications about your work land here.")
                    )
                    .padding(.top, 60)
                }
                if let nextCursor {
                    Button("Show older") {
                        Task { await load(cursor: nextCursor) }
                    }
                    .font(.system(size: 14, weight: .medium))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Color(.systemGroupedBackground))
        .refreshable { await load(cursor: nil) }
        .navigationTitle("Inbox")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    model.sync?.markInboxAllRead()
                    items = items.map { read($0) }
                } label: {
                    Image(systemName: "checkmark.circle")
                }
                .disabled(items.allSatisfy { $0.readAt != nil })
            }
        }
        .task { await load(cursor: nil) }
    }

    private func read(_ item: API.InboxItem) -> API.InboxItem {
        API.InboxItem(
            id: item.id, kind: item.kind, title: item.title, body: item.body,
            url: item.url, actorId: item.actorId, entityType: item.entityType,
            entityId: item.entityId, readAt: item.readAt ?? APIDate.dayString(.now),
            createdAt: item.createdAt
        )
    }

    @ViewBuilder
    private func row(_ item: API.InboxItem) -> some View {
        if item.entityType == "ticket",
           let ticket = model.tickets.first(where: { $0.uuid == item.entityId })
        {
            NavigationLink(value: ticket) { card(item) }.buttonStyle(.plain)
        } else if item.entityType == "task",
                  let task = model.tasks.first(where: { $0.uuid == item.entityId })
        {
            NavigationLink(value: task) { card(item) }.buttonStyle(.plain)
        } else if item.entityType == "thread",
                  let thread = model.chatThreads.first(where: { $0.id == item.entityId })
        {
            NavigationLink(value: thread) { card(item) }.buttonStyle(.plain)
        } else {
            card(item)
        }
    }

    private func card(_ item: API.InboxItem) -> some View {
        HStack(alignment: .top, spacing: 10) {
            if let actorId = item.actorId,
               let actor = Mapper.user(id: actorId, in: actors)
            {
                AvatarView(user: actor, size: 30)
            } else {
                Image(systemName: "bell.fill")
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
                    .frame(width: 30, height: 30)
                    .background(Color(.tertiarySystemFill), in: .circle)
            }
            VStack(alignment: .leading, spacing: 3) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    if item.readAt == nil {
                        Circle()
                            .fill(Color.accentColor)
                            .frame(width: 7, height: 7)
                    }
                    Text(item.title)
                        .font(.system(size: 14, weight: item.readAt == nil ? .semibold : .regular))
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                    Spacer(minLength: 6)
                    if let date = APIDate.parse(item.createdAt) {
                        Text(date.relativeShort)
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(.tertiary)
                    }
                }
                if let body = item.body, !body.isEmpty {
                    Text(body)
                        .font(.system(size: 13))
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 14))
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
        )
        .contentShape(.rect)
    }

    private func load(cursor: String?) async {
        guard let sync = model.sync else { return }
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

#Preview {
    NavigationStack {
        InboxView(model: AppModel())
    }
}
