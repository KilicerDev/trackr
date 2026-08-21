//
//  ChatThreadView.swift
//  trackr-mobile-ios
//
//  One chat thread: root post, replies on the shared activity timeline,
//  reply composer, resolve toggle, and create-ticket-from-thread (which
//  really creates the ticket and drops the system marker, web parity).
//

import SwiftUI

struct ChatThreadView: View {
    @Bindable var model: AppModel
    let threadId: String

    @State private var draft = ""

    /// Live copy from the model so replies/resolve reflect immediately.
    private var thread: ChatThread {
        model.chatThreads.first { $0.id == threadId }
            ?? ChatThread(id: threadId, org: TicketItem.sampleOrgs[0], title: "")
    }

    private var me: UserRef { model.me }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header

                    ForEach(thread.messages.dropFirst()) { message in
                        row(for: message).id(message.id)
                    }
                }
                .background(alignment: .leading) {
                    if thread.replyCount > 0 {
                        Rectangle()
                            .fill(Color(.separator).opacity(0.5))
                            .frame(width: 1)
                            .offset(x: TimelineRow<EmptyView>.nodeSize / 2)
                            .padding(.vertical, 10)
                    }
                }
                .padding(16)
            }
            .defaultScrollAnchor(thread.replyCount > 2 ? .bottom : .top)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: thread.messages.count) {
                if let last = thread.messages.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
        .background(Color.webBackground)
        .navigationTitle(thread.org.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button {
                        setResolved(!thread.resolved)
                    } label: {
                        Label(
                            thread.resolved ? "Reopen" : "Mark as Resolved",
                            systemImage: thread.resolved ? "arrow.uturn.backward" : "checkmark.circle"
                        )
                    }
                    Button {
                        createTicket()
                    } label: {
                        Label("Create Ticket", systemImage: "ticket")
                    }
                } label: {
                    Image(systemName: "ellipsis")
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            MessageComposer(text: $draft, placeholder: "Reply…", onAttach: {
                // Attachments — wired up later
            }, onSend: send)
        }
        .onAppear {
            markRead()
            // Screen-appear revalidation + server-side read cursor (the
            // thread GET marks it read).
            Task { await model.sync?.loadChatThread(id: threadId) }
        }
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(thread.title)
                    .font(.system(size: 20, weight: .bold))
                Spacer()
                if thread.resolved {
                    HStack(spacing: 3) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 12))
                        Text("Resolved")
                            .font(.system(size: 12, weight: .medium))
                    }
                    .foregroundStyle(Color(hex: 0x7FC8A9))
                }
            }
            if !thread.tags.isEmpty {
                HStack(spacing: 10) {
                    ForEach(thread.tags, id: \.self) { tag in
                        HStack(spacing: 4) {
                            Circle()
                                .fill(tag.color)
                                .frame(width: 6, height: 6)
                            Text(tag.label)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if let root = thread.root {
                HStack(spacing: 8) {
                    AvatarView(user: root.user, size: 24)
                    Text(root.user.name)
                        .font(.system(size: 14, weight: .medium))
                    Text(root.date.relativeShort)
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(.tertiary)
                }
                MessageCard(text: root.text)
            }
        }
        .padding(.bottom, 4)
        .background(Color.webBackground)
    }

    @ViewBuilder
    private func row(for message: ChatMessageItem) -> some View {
        if let ticketId = message.systemTicketId {
            TimelineRow(
                node: .icon("ticket"),
                name: message.user.name,
                action: "created ticket \(ticketId)",
                date: message.date
            ) {
                if let ticket = model.tickets.first(where: { $0.id == ticketId }) {
                    NavigationLink(value: ticket) {
                        HStack(spacing: 8) {
                            Circle()
                                .fill(ticket.status.color)
                                .frame(width: 8, height: 8)
                            Text(ticket.subject)
                                .font(.system(size: 14, weight: .medium))
                                .lineLimit(1)
                                .foregroundStyle(Color(.label))
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundStyle(Color(.tertiaryLabel))
                        }
                        .padding(10)
                        .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 12))
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
                        )
                        .contentShape(.rect)
                    }
                    .buttonStyle(.plain)
                }
            }
        } else {
            TimelineRow(
                node: .avatar(message.user),
                name: message.user.name,
                action: "replied",
                date: message.date
            ) {
                MessageCard(text: message.text)
            }
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
    }

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        withThread { $0.messages.append(ChatMessageItem(user: me, date: .now, text: text)) }
        draft = ""
        model.sync?.sendChatMessage(threadId: threadId, text: text)
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
        // v1 has no create-from-thread endpoint (the system marker is a web
        // form action) — create the ticket and post a plain marker message.
        if let orgId = thread.org.serverId {
            model.sync?.createTicket(
                orgId: orgId,
                subject: thread.title,
                description: thread.root?.text,
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
}
