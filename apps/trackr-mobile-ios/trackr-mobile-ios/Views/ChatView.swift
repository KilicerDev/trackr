//
//  ChatView.swift
//  trackr-mobile-ios
//
//  Org support chat root (web /chat): page header + mono count, an org
//  chip and tag filter chips in the toolbar row, then flat thread rows
//  separated by hairlines (Inbox-row metric: unread dot · avatar 34 ·
//  title · last message · time). Owns the chat navigation stack.
//

import SwiftUI

struct ChatView: View {
    @Bindable var model: AppModel

    @State private var selectedOrg: OrgRef?
    @State private var tagFilter: ChatTag?
    @State private var sheet: Sheet?
    @State private var openedFirst = false

    private enum Sheet: String, Identifiable {
        case org, newThread
        var id: String { rawValue }
    }

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

    private var meta: String {
        let all = model.chatThreads.filter { $0.org == activeOrg }
        let unread = all.filter(\.unread).count
        return unread > 0 ? "\(unread) unread" : "\(all.count) threads"
    }

    var body: some View {
        NavigationStack(path: $model.chatPath) {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    TKPageHeader("Chat") {
                        HStack(spacing: 10) {
                            Text(meta)
                                .font(.tkMono(12))
                                .foregroundStyle(TK.text3)
                            TKPlusButton(label: "New thread") { sheet = .newThread }
                        }
                    }
                    toolbar
                    if orgThreads.isEmpty {
                        TKEmptyState(text: tagFilter == nil
                            ? "No threads yet.\nStart the first conversation with +."
                            : "No threads with this tag.")
                    } else {
                        ForEach(orgThreads) { thread in
                            NavigationLink(value: thread) {
                                ThreadRow(thread: thread)
                            }
                            .buttonStyle(TKPressStyle())
                        }
                    }
                }
                .padding(.bottom, 24)
            }
            .tkRootScreen(model)
            .refreshable { await model.sync?.refreshChat() }
            .navigationDestination(for: ChatThread.self) { thread in
                ChatThreadView(model: model, threadId: thread.id)
            }
            .sheet(item: $sheet) { which in
                switch which {
                case .org:
                    TKPickerSheet(
                        title: "Organization",
                        options: model.orgs.map { org in
                            TKPickerOption(org, label: org.name) { TKPickerIcon.dot(org.color) }
                        },
                        selected: activeOrg
                    ) { selectedOrg = $0 }
                case .newThread:
                    if let activeOrg {
                        NewThreadSheet(org: activeOrg, availableTags: model.chatTags,
                                       author: model.me) { thread in
                            model.chatThreads.insert(thread, at: 0)
                            if let orgId = activeOrg.serverId, let root = thread.root {
                                model.sync?.createChatThread(
                                    orgId: orgId, title: thread.title, body: root.text
                                )
                            }
                        }
                    }
                }
            }
            // Switching orgs drops a tag filter that may not exist there.
            .onChange(of: selectedOrg) { tagFilter = nil }
            .onAppear(perform: openFirstIfAsked)
        }
    }

    // MARK: - Toolbar row

    private var toolbar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                if let activeOrg {
                    TKToolbarButton(action: { sheet = .org }) {
                        HStack(spacing: 7) {
                            TKDot(color: activeOrg.color)
                            Text(activeOrg.name)
                                .lineLimit(1)
                            TKChevron()
                        }
                    }
                }
                if !orgTags.isEmpty {
                    Rectangle()
                        .fill(TK.hairlineStrong)
                        .frame(width: 1, height: 20)
                        .padding(.horizontal, 2)
                    TKToolbarButton(active: tagFilter == nil, action: { tagFilter = nil }) {
                        Text("All")
                    }
                    ForEach(orgTags, id: \.self) { tag in
                        TKToolbarButton(active: tagFilter == tag, action: {
                            tagFilter = tagFilter == tag ? nil : tag
                        }) {
                            HStack(spacing: 6) {
                                TKDot(color: tag.color, size: 6)
                                Text(tag.label)
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, TK.gutter)
        }
        .padding(.top, 6)
        .padding(.bottom, 12)
    }

    /// `--open-first` launch argument (simulator screenshots): push the
    /// richest sample thread once the root is on screen.
    private func openFirstIfAsked() {
        let args = ProcessInfo.processInfo.arguments
        if args.contains("--sheet"), sheet == nil { sheet = .newThread }
        guard !openedFirst, args.contains("--open-first"), model.chatPath.isEmpty else { return }
        openedFirst = true
        let candidates = model.chatThreads.sorted { $0.messages.count > $1.messages.count }
        if let thread = candidates.first {
            // Deferred: a path push during the first onAppear can be dropped.
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(600))
                model.chatPath.append(thread)
            }
        }
    }
}

// MARK: - Thread row

private struct ThreadRow: View {
    let thread: ChatThread

    /// "Renée: Thursday works, thank you!" — the latest human message.
    private var lastLine: String? {
        guard let last = thread.messages.last(where: { !$0.isSystem }) else { return nil }
        let first = last.user.name.split(separator: " ").first.map(String.init) ?? last.user.name
        return "\(first): \(Mentions.flattened(last.text))"
    }

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Circle()
                .fill(TK.accent)
                .frame(width: 6, height: 6)
                .opacity(thread.unread ? 1 : 0)
                .padding(.top, 14)
            AvatarView(user: thread.root?.user, size: 34)
            VStack(alignment: .leading, spacing: 4) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(thread.title)
                        .font(.system(size: 15, weight: thread.unread ? .semibold : .regular))
                        .foregroundStyle(TK.text)
                        .lineLimit(1)
                    Spacer(minLength: 6)
                    Text(thread.lastActivityAt.relativeShort)
                        .font(.tkMono(12))
                        .foregroundStyle(TK.text4)
                        .layoutPriority(1)
                }
                if let lastLine {
                    Text(lastLine)
                        .font(.system(size: 13))
                        .foregroundStyle(TK.text2)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)
                }
                HStack(spacing: 6) {
                    ForEach(thread.tags, id: \.self) { tag in
                        TKColorTagChip(label: tag.label, color: tag.color)
                    }
                    if thread.resolved {
                        HStack(spacing: 3) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 9, weight: .bold))
                            Text("resolved")
                                .font(.tkMono(11))
                        }
                        .foregroundStyle(TK.success)
                    }
                    Spacer(minLength: 0)
                    if thread.replyCount > 0 {
                        Text(thread.replyCount == 1 ? "1 reply" : "\(thread.replyCount) replies")
                            .font(.tkMono(11))
                            .foregroundStyle(TK.text4)
                    }
                }
                .padding(.top, 2)
            }
        }
        .padding(.leading, 12)
        .padding(.trailing, TK.gutter)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) { TKHairline() }
        .contentShape(.rect)
    }
}

#Preview {
    ChatView(model: AppModel())
        .preferredColorScheme(.dark)
}
