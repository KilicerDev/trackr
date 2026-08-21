//
//  TicketDetailView.swift
//  trackr-mobile-ios
//
//  Mobile version of the web ticket Inspector / detail page: editable
//  chips for status / priority / category, properties card, checklist,
//  and the conversation behind a chat button.
//
//  Design phase: edits mutate a local copy only — persistence comes with
//  the API.
//

import SwiftUI

struct TicketDetailView: View {
    @State var ticket: TicketItem
    /// nil in previews; the real app passes it so edits persist + push.
    var model: AppModel? = nil

    @State private var baseline: TicketItem?
    @State private var showingConversation = false
    @State private var showingAddTag = false

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                header
                properties
                section(checklistTitle) { checklistCard }
                if !ticket.tags.isEmpty {
                    section("Tags") { tagsRow }
                }
                section("Conversation") { conversationCard }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color.webBackground)
        // Chip edits land on the conversation timeline, like the web's
        // typed activity events.
        .onChange(of: ticket.status) { _, status in
            logActivity("changed status to \(status.label)", icon: "arrow.triangle.2.circlepath")
            persist()
        }
        .onChange(of: ticket.priority) { _, priority in
            logActivity("changed priority to \(priority.label)", icon: "flag")
            persist()
        }
        .onChange(of: ticket.category) { _, category in
            logActivity("changed category to \(category.label)", icon: "square.grid.2x2")
            persist()
        }
        .onChange(of: ticket.assignees) { persist() }
        .onChange(of: ticket.tags) { persist() }
        .onAppear {
            baseline = ticket
            // Screen-appear revalidation: the list payload has no messages,
            // so the conversation and fresh properties load here.
            if let uuid = ticket.uuid, let model {
                Task {
                    await model.sync?.loadTicketDetail(uuid: uuid)
                    if baseline == ticket,
                       let fresh = model.tickets.first(where: { $0.uuid == uuid })
                    {
                        ticket = fresh
                        baseline = fresh
                    }
                }
            }
        }
        .onDisappear { persist() }
        .navigationTitle(ticket.id)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingAddTag = true
                } label: {
                    Image(systemName: "tag")
                }
            }
            ToolbarSpacer(.fixed, placement: .topBarTrailing)
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingConversation = true
                } label: {
                    Image(systemName: "bubble.left")
                }
            }
        }
        .navigationDestination(isPresented: $showingConversation) {
            TicketConversationView(ticket: $ticket, model: model)
        }
        .sheet(isPresented: $showingAddTag) {
            AddTagSheet(
                existingTags: ticket.tags,
                allTags: (model?.tickets ?? TicketItem.samples).flatMap(\.tags)
            ) { tag in
                ticket.tags.append(tag)
            }
        }
    }

    private var checklistTitle: String {
        ticket.checklistTotal > 0
            ? "Checklist \(ticket.checklistDone)/\(ticket.checklistTotal)"
            : "Checklist"
    }

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Circle()
                    .fill(ticket.org.color)
                    .frame(width: 8, height: 8)
                Text(ticket.org.name)
                    .font(.system(size: 13))
                    .foregroundStyle(.secondary)
            }
            TextField("Subject", text: $ticket.subject, axis: .vertical)
                .font(.system(size: 22, weight: .semibold))
            // Web ticket Inspector parity: neutral surface chips (colored
            // glyph + primary label) in a wrapping rail, assignee included.
            ChipFlow {
                Menu {
                    Picker("Status", selection: $ticket.status) {
                        ForEach(TicketStatus.allCases) { Text($0.label).tag($0) }
                    }
                } label: {
                    PropertyChip {
                        Circle()
                            .fill(ticket.status.color)
                            .frame(width: 8, height: 8)
                        Text(ticket.status.label)
                    }
                }
                .id(ticket.status)
                Menu {
                    Picker("Priority", selection: $ticket.priority) {
                        ForEach(TaskPriority.ticketCases, id: \.self) {
                            Text($0.label).tag($0)
                        }
                    }
                } label: {
                    PropertyChip {
                        PriorityBars(priority: ticket.priority)
                        Text(ticket.priority.label)
                    }
                }
                .id(ticket.priority)
                Menu {
                    Picker("Category", selection: $ticket.category) {
                        ForEach(TicketCategory.allCases) { Text($0.label).tag($0) }
                    }
                } label: {
                    PropertyChip {
                        Circle()
                            .fill(ticket.category.color)
                            .frame(width: 8, height: 8)
                        Text(ticket.category.label)
                    }
                }
                .id(ticket.category)
                assigneeChip
            }
        }
        .padding(.top, 8)
    }

    private var assigneeChip: some View {
        Menu {
            ForEach(model?.assignableUsers ?? TaskItem.sampleUsers, id: \.self) { user in
                Toggle(user.name, isOn: Binding(
                    get: { ticket.assignees.contains(user) },
                    set: { isOn in
                        if isOn {
                            ticket.assignees.append(user)
                        } else {
                            ticket.assignees.removeAll { $0 == user }
                        }
                    }
                ))
            }
        } label: {
            if ticket.assignees.isEmpty {
                PropertyChip(style: .empty) {
                    Image(systemName: "person")
                        .font(.system(size: 12))
                    Text("Unassigned")
                }
            } else {
                PropertyChip {
                    AvatarStack(users: ticket.assignees, size: 20)
                    Text(ticket.assignees.count == 1
                         ? ticket.assignees[0].name
                         : "\(ticket.assignees.count) assignees")
                }
            }
        }
        .id(ticket.assignees)
    }

    private var properties: some View {
        VStack(spacing: 0) {
            propertyRow("Customer") {
                if let customer = ticket.customer {
                    HStack(spacing: 6) {
                        AvatarView(user: customer, size: 20)
                        Text(customer.name)
                    }
                } else {
                    Text("—")
                        .foregroundStyle(.tertiary)
                }
            }
            divider
            propertyRow("Channel") {
                HStack(spacing: 5) {
                    Image(systemName: ticket.channel.systemImage)
                        .font(.system(size: 12))
                        .foregroundStyle(.secondary)
                    Text(ticket.channel.label)
                }
            }
            divider
            propertyRow("Created") {
                Text(ticket.createdAt.formatted(.dateTime.day().month(.abbreviated).year()))
                    .monospaced()
            }
            divider
            propertyRow("First response") {
                Text(ticket.firstResponseAt.map(\.relativeShort) ?? "—")
                    .monospaced()
                    .foregroundStyle(ticket.firstResponseAt == nil ? .tertiary : .primary)
            }
        }
        .cardStyle(padded: false)
    }

    private var checklistCard: some View {
        ChecklistCard(items: $ticket.checklist)
    }

    private var tagsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(ticket.tags, id: \.self) { tag in
                    TagChip(tag: tag)
                        .contextMenu {
                            Button(role: .destructive) {
                                ticket.tags.removeAll { $0 == tag }
                            } label: {
                                Label("Remove", systemImage: "trash")
                            }
                        }
                }
            }
        }
    }

    /// Preview of the latest public message with a jump into the full
    /// conversation — the thread itself lives one push deeper.
    private var conversationCard: some View {
        Button {
            showingConversation = true
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                if let last = ticket.messages.last(where: { !$0.internalNote }) {
                    HStack(spacing: 6) {
                        AvatarView(user: last.user, size: 20)
                        Text(last.user.name)
                            .font(.system(size: 13, weight: .medium))
                        Spacer()
                        Text(last.date.relativeShort)
                            .font(.system(size: 12, design: .monospaced))
                            .foregroundStyle(.tertiary)
                    }
                    Text(Mentions.flattened(last.text))
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                        .multilineTextAlignment(.leading)
                } else {
                    Text("No messages yet.")
                        .font(.system(size: 14))
                        .foregroundStyle(.secondary)
                }
                HStack(spacing: 5) {
                    Image(systemName: "bubble.left")
                        .font(.system(size: 11))
                    Text(ticket.messageCount == 1
                         ? "1 message"
                         : "\(ticket.messageCount) messages")
                }
                .font(.system(size: 13, weight: .medium))
                .foregroundStyle(Color.accentColor)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .cardStyle()
    }

    // MARK: - Helpers

    private func logActivity(_ text: String, icon: String) {
        ticket.activity.append(
            ActivityEvent(user: model?.me ?? TaskItem.sampleUsers[0], date: .now,
                          text: text, icon: icon)
        )
    }

    /// Write back into the shared model and push the API-editable fields
    /// (status/priority/category/assignees/tags — checklist/subject are
    /// desktop-only on the server and stay local).
    private func persist() {
        guard ticket != baseline else { return }
        baseline = ticket
        guard let model else { return }
        if let index = model.tickets.firstIndex(where: { $0.id == ticket.id }) {
            model.tickets[index] = ticket
        }
        model.sync?.pushTicket(ticket)
    }

    private func section(_ title: String, @ViewBuilder content: () -> some View) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title.uppercased())
                .font(.system(size: 11, weight: .semibold))
                .tracking(0.6)
                .foregroundStyle(.secondary)
                .padding(.leading, 4)
            content()
        }
    }

    private func propertyRow(_ label: String, @ViewBuilder value: () -> some View) -> some View {
        HStack {
            Text(label)
                .font(.system(size: 14))
                .foregroundStyle(.secondary)
            Spacer()
            value()
                .font(.system(size: 14))
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }

    private var divider: some View {
        Divider().padding(.leading, 14)
    }
}

#Preview {
    NavigationStack {
        TicketDetailView(ticket: TicketItem.samples[1])
    }
}
