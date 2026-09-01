//
//  TicketConversationView.swift
//  trackr-mobile-ios
//
//  Ticket thread on the shared activity timeline: customer and agent
//  replies plus yellow-tinted internal notes, composer pinned below with
//  a reply / internal-note switch — web ticket detail, mobile shape.
//

import SwiftUI

struct TicketConversationView: View {
    @Binding var ticket: TicketItem
    var model: AppModel? = nil

    @State private var draft = ""
    @State private var internalNote = false

    private let internalColor = Color(hex: 0xE9C46A)

    private enum Event: Identifiable {
        case opening(TicketMessage)
        case message(TicketMessage)
        case activity(ActivityEvent)

        var id: String {
            switch self {
            case .opening(let m), .message(let m): m.id
            case .activity(let a): a.id.uuidString
            }
        }

        var date: Date {
            switch self {
            case .opening(let m), .message(let m): m.date
            case .activity(let a): a.date
            }
        }
    }

    /// The description leads the timeline as the opening message (web
    /// parity), followed by real messages and activity in time order.
    private var events: [Event] {
        let opening = ticket.openingMessage.map { [Event.opening($0)] } ?? []
        return opening
            + (ticket.messages.map(Event.message) + ticket.activity.map(Event.activity))
                .sorted { $0.date < $1.date }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    ForEach(events) { event in
                        row(for: event).id(event.id)
                    }
                    if events.isEmpty {
                        Text("No messages yet.")
                            .font(.system(size: 14))
                            .foregroundStyle(.tertiary)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 40)
                    }
                }
                // Span the full width so short rows don't get centred as a
                // content-sized column.
                .frame(maxWidth: .infinity, alignment: .leading)
                // The rail: a hairline behind the node column — only once
                // there is a column to sit behind.
                .background(alignment: .leading) {
                    if !events.isEmpty {
                        Rectangle()
                            .fill(Color(.separator).opacity(0.5))
                            .frame(width: 1)
                            .offset(x: TimelineRow<EmptyView>.nodeSize / 2)
                            .padding(.vertical, 10)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
            .defaultScrollAnchor(events.isEmpty ? .top : .bottom)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: ticket.messages.count) {
                if let last = events.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
        .background(Color.webBackground)
        // Adopt the server's conversation as soon as a refetch lands (sent
        // message + its uploads, SSE) — the optimistic row with its pending
        // previews is replaced by the real message with attachments.
        .onChange(of: model?.tickets.first { $0.id == ticket.id }?.messages) { _, fresh in
            guard let fresh, fresh != ticket.messages else { return }
            ticket.messages = fresh
        }
        .navigationTitle("Conversation")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 6) {
                HStack {
                    Spacer()
                    Button {
                        internalNote.toggle()
                    } label: {
                        HStack(spacing: 5) {
                            Image(systemName: internalNote ? "lock.fill" : "lock.open")
                                .font(.system(size: 11))
                            Text("Internal note")
                        }
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(internalNote ? internalColor : Color(.secondaryLabel))
                        .padding(.horizontal, 10)
                        .frame(height: 26)
                        .background(
                            internalNote
                                ? internalColor.opacity(0.12)
                                : Color(.secondarySystemGroupedBackground),
                            in: .capsule
                        )
                        .overlay(
                            Capsule().strokeBorder(
                                internalNote
                                    ? internalColor.opacity(0.35)
                                    : Color(.separator).opacity(0.4),
                                lineWidth: 1
                            )
                        )
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 24)
                MessageComposer(
                    text: $draft,
                    placeholder: internalNote ? "Internal note…" : "Reply to customer…",
                    mentionCandidates: (model?.assignableUsers ?? []) + ticket.messages.map(\.user),
                    onSendFiles: send
                )
            }
        }
    }

    @ViewBuilder
    private func row(for event: Event) -> some View {
        switch event {
        case .opening(let message):
            TimelineRow(
                node: .avatar(message.user),
                name: message.user.name,
                action: "opened the ticket",
                date: message.date
            ) {
                MessageCard(text: message.text, attachments: message.attachments)
            }
        case .message(let message):
            TimelineRow(
                node: .avatar(message.user),
                name: message.user.name,
                action: message.internalNote ? "added an internal note" : "replied",
                date: message.date
            ) {
                MessageCard(
                    text: message.text,
                    accent: message.internalNote ? internalColor : nil,
                    attachments: message.attachments,
                    pendingFiles: message.pendingFiles
                )
            }
        case .activity(let activity):
            TimelineRow(
                node: .icon(activity.icon),
                name: activity.user.name,
                action: activity.text,
                date: activity.date
            )
        }
    }

    private func send(files: [PickedFile]) {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let me = model?.me ?? TaskItem.sampleUsers[0]
        ticket.messages.append(
            TicketMessage(
                user: me, date: .now, text: text, internalNote: internalNote,
                pendingFiles: files
            )
        )
        if ticket.firstResponseAt == nil && !internalNote {
            ticket.firstResponseAt = .now
        }
        if let uuid = ticket.uuid {
            model?.sync?.sendTicketMessage(
                ticketUUID: uuid, text: text, internalNote: internalNote, files: files
            )
        }
        draft = ""
        internalNote = false
    }
}

#Preview {
    @Previewable @State var ticket = TicketItem.samples[1]
    NavigationStack {
        TicketConversationView(ticket: $ticket)
    }
}
