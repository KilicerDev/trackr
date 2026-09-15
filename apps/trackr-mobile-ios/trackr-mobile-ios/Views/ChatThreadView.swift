//
//  ChatThreadView.swift
//  trackr-mobile-ios
//
//  One chat thread as a detail screen: title + tags, then the root post
//  and replies as activity rows (TimelineRow + MessageCard, like the
//  ticket detail) with mono day separators; reply composer in the bottom
//  inset, the session mini bar above it while a session runs. Resolve
//  and create-ticket-from-thread live in the trailing "…" sheet.
//

import SwiftUI

struct ChatThreadView: View {
    @Bindable var model: AppModel
    let threadId: String

    @State private var draft = ""
    @State private var showingActions = false

    private enum ThreadAction: String, Hashable {
        case resolve, ticket
    }

    /// Live copy from the model so replies/resolve reflect immediately.
    private var thread: ChatThread {
        model.chatThreads.first { $0.id == threadId }
            ?? ChatThread(id: threadId, org: TicketItem.sampleOrgs[0], title: "")
    }

    private var me: UserRef { model.me }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    header
                    ForEach(Array(thread.messages.enumerated()), id: \.element.id) { index, message in
                        if index == 0 || !Calendar.current.isDate(
                            thread.messages[index - 1].date, inSameDayAs: message.date
                        ) {
                            ChatDayPill(date: message.date)
                        }
                        row(for: message, isRoot: index == 0)
                            .id(message.id)
                    }
                }
                .padding(.horizontal, TK.gutter)
                .padding(.top, 8)
                .padding(.bottom, 16)
            }
            .defaultScrollAnchor(thread.replyCount > 2 ? .bottom : .top)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: thread.messages.count) {
                if let last = thread.messages.last {
                    withAnimation(.easeOut(duration: 0.25)) { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
        .tkDetailScreen()
        .toolbar {
            ToolbarItem(placement: .principal) { principal }
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingActions = true
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(TK.text)
                        .frame(width: 36, height: 36)
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Thread actions")
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if model.session.isRunning {
                TKSessionMiniBar(model: model)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 8)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            composer
        }
        .sheet(isPresented: $showingActions) {
            TKPickerSheet(
                title: "Thread",
                options: [
                    TKPickerOption(ThreadAction.resolve,
                                   label: thread.resolved ? "Reopen thread" : "Mark as resolved") {
                        TKPickerIcon.symbol(
                            thread.resolved ? "arrow.uturn.backward" : "checkmark.circle",
                            color: thread.resolved ? TK.text2 : TK.success
                        )
                    },
                    TKPickerOption(ThreadAction.ticket, label: "Create ticket from thread") {
                        TKPickerIcon.symbol("ticket")
                    },
                ],
                selected: nil
            ) { action in
                switch action {
                case .resolve: setResolved(!thread.resolved)
                case .ticket: createTicket()
                }
            }
        }
        .onAppear {
            markRead()
            // Screen-appear revalidation + server-side read cursor (the
            // thread GET marks it read).
            Task { await model.sync?.loadChatThread(id: threadId) }
        }
    }

    // MARK: - Chrome

    private var principal: some View {
        VStack(spacing: 1) {
            Text(thread.title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(TK.text)
                .lineLimit(1)
            HStack(spacing: 5) {
                TKDot(color: thread.org.color, size: 6)
                Text(thread.org.name)
                    .font(.system(size: 11))
                    .foregroundStyle(TK.text3)
            }
        }
        .frame(maxWidth: 220)
    }

    private var composer: some View {
        VStack(spacing: 0) {
            TKHairline(color: TK.border)
            MessageComposer(
                text: $draft,
                placeholder: thread.resolved ? "Reply (reopens the thread)…" : "Reply…",
                mentionCandidates: model.assignableUsers + thread.messages.map(\.user),
                onSendFiles: send
            )
            .padding(.vertical, 8)
        }
        .background(TK.bg)
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(thread.title)
                .font(.tkDetailTitle)
                .tkTitleTracking()
                .foregroundStyle(TK.text)
                .fixedSize(horizontal: false, vertical: true)
            if !thread.tags.isEmpty || thread.resolved {
                HStack(spacing: 6) {
                    ForEach(thread.tags, id: \.self) { tag in
                        TKColorTagChip(label: tag.label, color: tag.color)
                    }
                    if thread.resolved {
                        HStack(spacing: 4) {
                            Image(systemName: "checkmark")
                                .font(.system(size: 9, weight: .bold))
                            Text("resolved")
                                .font(.tkMono(11))
                        }
                        .foregroundStyle(TK.success)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(TK.tint(TK.success), in: .rect(cornerRadius: 5))
                    }
                }
            }
            Text("\(thread.messages.count) messages")
                .font(.tkMono(11))
                .foregroundStyle(TK.text4)
        }
        .padding(.bottom, 4)
    }

    @ViewBuilder
    private func row(for message: ChatMessageItem, isRoot: Bool) -> some View {
        if let ticketId = message.systemTicketId {
            TimelineRow(
                node: .icon("ticket"),
                name: message.user.name,
                action: "created ticket \(ticketId)",
                date: message.date
            ) {
                if let ticket = model.tickets.first(where: { $0.id == ticketId }) {
                    Button {
                        model.open(ticket)
                    } label: {
                        HStack(spacing: 10) {
                            TKDot(color: ticket.status.color)
                            Text(ticket.id)
                                .font(.tkMono(12))
                                .foregroundStyle(TK.text3)
                            Text(ticket.subject)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(TK.text)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            TKDisclosure()
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 10)
                        .tkCard(radius: 12, padding: nil)
                        .contentShape(.rect)
                    }
                    .buttonStyle(TKScaleStyle())
                }
            }
        } else {
            ChatBubbleRow(
                user: message.user,
                text: message.text,
                date: message.date,
                attachments: message.attachments,
                pendingFiles: message.pendingFiles,
                mine: message.user.isSame(as: me)
            )
        }
    }

    // MARK: - Actions

    private func withThread(_ mutate: (inout ChatThread) -> Void) {
        guard let index = model.chatThreads.firstIndex(where: { $0.id == threadId }) else { return }
        mutate(&model.chatThreads[index])
    }

    private func markRead() {
        withThread { $0.unread = false }
    }

    private func setResolved(_ resolved: Bool) {
        withThread { $0.resolved = resolved }
        model.toast(resolved ? "Thread resolved" : "Thread reopened")
    }

    private func send(files: [PickedFile]) {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        withThread {
            $0.messages.append(ChatMessageItem(user: me, date: .now, text: text, pendingFiles: files))
        }
        draft = ""
        model.sync?.sendChatMessage(threadId: threadId, text: text, files: files)
    }

    /// Web parity (CreateTicketFromThreadModal): materialize the thread into
    /// a ticket and drop a system marker into the conversation.
    private func createTicket() {
        let nextNumber = model.tickets
            .filter { $0.org == thread.org }
            .compactMap { Int($0.id.split(separator: "-").last ?? "") }
            .max()
            .map { $0 + 1 } ?? 1
        let ticketId = "\(thread.org.key)-\(nextNumber)"
        let ticket = TicketItem(
            id: ticketId,
            subject: thread.title,
            status: .open,
            priority: .medium,
            category: .general,
            channel: .chat,
            org: thread.org,
            customer: thread.root?.user,
            assignees: [me],
            messages: thread.root.map {
                [TicketMessage(user: $0.user, date: $0.date, text: $0.text)]
            } ?? [],
            createdAt: .now
        )
        model.tickets.insert(ticket, at: 0)
        withThread {
            $0.messages.append(ChatMessageItem(
                user: me, date: .now,
                text: "Tracked as a ticket:", systemTicketId: ticketId
            ))
        }
        model.toast("\(ticketId) created")
        // v1 has no create-from-thread endpoint (the system marker is a web
        // form action) — create the ticket and post a plain marker message.
        if let orgId = thread.org.serverId {
            model.sync?.createTicket(
                orgId: orgId,
                subject: thread.title,
                description: thread.root?.text,
                priority: .medium,
                category: .general,
                assignees: [me]
            )
            model.sync?.sendChatMessage(
                threadId: threadId,
                text: "Tracked as a ticket: \(thread.title)"
            )
        }
    }
}

#Preview {
    NavigationStack {
        ChatThreadView(model: AppModel(), threadId: ChatThread.samples[1].id)
    }
    .preferredColorScheme(.dark)
}

#Preview("With session") {
    let model = AppModel()
    model.startSession(for: TaskItem.samples[0])
    model.showingPlayer = false
    return NavigationStack {
        ChatThreadView(model: model, threadId: ChatThread.samples[0].id)
    }
    .preferredColorScheme(.dark)
}
