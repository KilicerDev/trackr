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
        case message(TicketMessage)
        case activity(ActivityEvent)

        var id: String {
            switch self {
            case .message(let m): m.id
            case .activity(let a): a.id.uuidString
            }
        }

        var date: Date {
            switch self {
            case .message(let m): m.date
            case .activity(let a): a.date
            }
        }
    }

    private var events: [Event] {
        (ticket.messages.map(Event.message) + ticket.activity.map(Event.activity))
            .sorted { $0.date < $1.date }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    ForEach(events) { event in
                        row(for: event).id(event.id)
                    }
                }
                // The rail: a hairline behind the node column.
                .background(alignment: .leading) {
                    Rectangle()
                        .fill(Color(.separator).opacity(0.5))
                        .frame(width: 1)
                        .offset(x: TimelineRow<EmptyView>.nodeSize / 2)
                        .padding(.vertical, 10)
                }
                .padding(.horizontal, 16)
                .padding(.vertical, 16)
            }
            .defaultScrollAnchor(.bottom)
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: ticket.messages.count) {
                if let last = events.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
        .background(Color.webBackground)
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
                    onAttach: {
                        // Attachments — wired up later
                    },
                    onSend: send
                )
            }
        }
    }

    @ViewBuilder
    private func row(for event: Event) -> some View {
        switch event {
        case .message(let message):
            TimelineRow(
                node: .avatar(message.user),
                name: message.user.name,
                action: message.internalNote ? "added an internal note" : "replied",
                date: message.date
            ) {
                MessageCard(
                    text: message.text,
                    accent: message.internalNote ? internalColor : nil
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

    private func send() {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        let me = model?.me ?? TaskItem.sampleUsers[0]
        ticket.messages.append(
            TicketMessage(user: me, date: .now, text: text, internalNote: internalNote)
        )
        if ticket.firstResponseAt == nil && !internalNote {
            ticket.firstResponseAt = .now
        }
        if let uuid = ticket.uuid {
            model?.sync?.sendTicketMessage(ticketUUID: uuid, text: text, internalNote: internalNote)
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
