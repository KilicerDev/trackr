//
//  ChatView.swift
//  trackr-mobile-ios
//
//  Org support chat: forum-style thread feed (web /chat) — org switcher
//  in the toolbar, tag filter chips, thread cards with unread dots.
//  Pushed from the Home quick links.
//

import SwiftUI

struct ChatView: View {
    @Bindable var model: AppModel

    @State private var selectedOrg: OrgRef?
    @State private var tagFilter: ChatTag?
    @State private var showingNewThread = false

    private var activeOrg: OrgRef? { selectedOrg ?? model.orgs.first }

    private var orgThreads: [ChatThread] {
        model.chatThreads
            .filter { $0.org == activeOrg }
            .filter { tagFilter == nil || $0.tags.contains(tagFilter!) }
            .sorted { $0.lastActivityAt > $1.lastActivityAt }
    }

    /// Tags that actually occur in the active org's threads.
    private var orgTags: [ChatTag] {
        var seen: [ChatTag] = []
        for thread in model.chatThreads where thread.org == activeOrg {
            for tag in thread.tags where !seen.contains(tag) {
                seen.append(tag)
            }
        }
        return seen
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                if !orgTags.isEmpty {
                    tagChips
                }
                ForEach(orgThreads) { thread in
                    NavigationLink(value: thread) {
                        ThreadCard(thread: thread)
                    }
                    .buttonStyle(.plain)
                }
                if orgThreads.isEmpty {
                    ContentUnavailableView(
                        "No threads",
                        systemImage: "bubble.left.and.bubble.right",
                        description: Text(tagFilter == nil
                            ? "Start the first conversation with the plus button."
                            : "No threads with this tag.")
                    )
                    .padding(.top, 60)
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .background(Color(.systemGroupedBackground))
        .refreshable { await model.sync?.refreshChat() }
        .navigationTitle("Chat")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Picker("Organization", selection: $selectedOrg) {
                        ForEach(model.orgs, id: \.self) { org in
                            Text(org.name).tag(org as OrgRef?)
                        }
                    }
                } label: {
                    Image(systemName: "building.2")
                }
                .id(activeOrg)
            }
            ToolbarSpacer(.fixed, placement: .topBarTrailing)
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingNewThread = true
                } label: {
                    Image(systemName: "plus")
                }
            }
        }
        .sheet(isPresented: $showingNewThread) {
            if let activeOrg {
                NewThreadSheet(org: activeOrg, availableTags: model.chatTags) { thread in
                    model.chatThreads.insert(thread, at: 0)
                    if let orgId = activeOrg.serverId, let root = thread.root {
                        model.sync?.createChatThread(
                            orgId: orgId, title: thread.title, body: root.text
                        )
                    }
                }
            }
        }
        // Switching orgs drops a tag filter that may not exist there.
        .onChange(of: selectedOrg) { tagFilter = nil }
    }

    private var tagChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 7) {
                filterChip(label: "All", color: nil, selected: tagFilter == nil) {
                    tagFilter = nil
                }
                ForEach(orgTags, id: \.self) { tag in
                    filterChip(label: tag.label, color: tag.color, selected: tagFilter == tag) {
                        tagFilter = tagFilter == tag ? nil : tag
                    }
                }
            }
            .padding(.horizontal, 4)
        }
    }

    private func filterChip(
        label: String, color: Color?, selected: Bool, action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let color {
                    Circle()
                        .fill(color)
                        .frame(width: 7, height: 7)
                }
                Text(label)
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundStyle(selected ? Color.accentColor : Color(.secondaryLabel))
            .padding(.horizontal, 11)
            .frame(height: 28)
            .background(
                selected ? Color.accentColor.opacity(0.12) : Color(.secondarySystemGroupedBackground),
                in: .capsule
            )
            .overlay(
                Capsule().strokeBorder(
                    selected ? Color.accentColor.opacity(0.35) : Color(.separator).opacity(0.4),
                    lineWidth: 1
                )
            )
        }
        .buttonStyle(.plain)
    }
}

private struct ThreadCard: View {
    let thread: ChatThread

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if thread.unread {
                    Circle()
                        .fill(Color.accentColor)
                        .frame(width: 8, height: 8)
                }
                Text(thread.title)
                    .font(.system(size: 16, weight: .semibold))
                    .lineLimit(2)
                    .multilineTextAlignment(.leading)
                Spacer(minLength: 8)
                if thread.resolved {
                    HStack(spacing: 3) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 11))
                        Text("Resolved")
                            .font(.system(size: 11, weight: .medium))
                    }
                    .foregroundStyle(Color(hex: 0x7FC8A9))
                }
            }

            if let root = thread.root {
                HStack(alignment: .top, spacing: 8) {
                    AvatarView(user: root.user, size: 22)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 5) {
                            Text(root.user.name)
                                .font(.system(size: 13, weight: .medium))
                            Text(root.date.relativeShort)
                                .font(.system(size: 11, design: .monospaced))
                                .foregroundStyle(.tertiary)
                        }
                        Text(root.text)
                            .font(.system(size: 14))
                            .foregroundStyle(.secondary)
                            .lineLimit(3)
                            .multilineTextAlignment(.leading)
                    }
                }
            }

            HStack(spacing: 10) {
                ForEach(thread.tags, id: \.self) { tag in
                    HStack(spacing: 4) {
                        Circle()
                            .fill(tag.color)
                            .frame(width: 6, height: 6)
                        Text(tag.label)
                            .font(.system(size: 11, weight: .medium))
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
                if thread.replyCount > 0 {
                    Text(thread.replyCount == 1 ? "1 reply" : "\(thread.replyCount) replies")
                        .font(.system(size: 12))
                        .foregroundStyle(.tertiary)
                }
            }
        }
        .padding(14)
        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
        )
    }
}

#Preview {
    NavigationStack {
        ChatView(model: AppModel())
    }
}
