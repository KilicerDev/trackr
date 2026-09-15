//
//  TicketDetailView.swift
//  trackr-mobile-ios
//
//  Ticket detail on the prototype design: KEY · org in the nav bar, title,
//  property chips (status / priority / category / assignees → picker
//  sheets), description, action strip (tags, create task, attachments),
//  details card, linked tasks, checklist, and the conversation timeline —
//  with the reply / internal-note composer pinned to the bottom.
//
//  Edits mutate a local copy, persist into the model and push through the
//  sync engine (properties on change, checklist via its own endpoint).
//

import SwiftUI

struct TicketDetailView: View {
    @State var ticket: TicketItem
    /// nil in previews; the real app passes it so edits persist + push.
    var model: AppModel? = nil

    @Environment(\.dismiss) private var dismiss

    @State private var baseline: TicketItem?
    @State private var picker: Picker?
    @State private var showingAddTag = false
    @State private var showingConvert = false
    @State private var showingAttachments = false
    @State private var showingChecklist = false
    @State private var confirmingDelete = false
    @State private var draft = ""
    @State private var internalNote = false

    private enum Picker: String, Identifiable {
        case status, priority, category, assignees
        var id: String { rawValue }
    }

    /// Staff gates (category edit, conversion, delete, internal notes).
    /// Previews without a model render the full staff surface.
    private var isStaff: Bool { model?.isStaff ?? true }

    private var users: [UserRef] { model?.assignableUsers ?? TaskItem.sampleUsers }

    /// The model row is the live copy for server-owned attachments —
    /// uploads from the sheet merge in there, not into the edit buffer.
    private var attachments: [AttachmentItem] {
        model?.tickets.first { $0.id == ticket.id }?.attachments ?? ticket.attachments
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text(ticket.subject)
                        .font(.tkDetailTitle)
                        .tkTitleTracking()
                        .foregroundStyle(TK.text)
                        .fixedSize(horizontal: false, vertical: true)
                    chips
                    if !ticket.details.isEmpty {
                        RichContentView(markdown: ticket.details)
                    }
                    actionStrip
                    detailsCard
                    if !ticket.linkedTasks.isEmpty {
                        linkedTasksCard
                    }
                    if !ticket.checklist.isEmpty || showingChecklist {
                        checklistSection
                    }
                    VStack(alignment: .leading, spacing: 14) {
                        TKSectionLabel("Activity")
                        TicketConversationView(ticket: ticket)
                    }
                }
                .padding(.horizontal, TK.gutter)
                .padding(.top, 10)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: ticket.messages.count) {
                if let last = TicketTimelineEvent.events(for: ticket).last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
        .tkDetailScreen()
        // Chip edits land on the timeline, like the web's typed activity
        // events, and push right away.
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
        .onChange(of: ticket.checklist) { persistChecklist() }
        // Adopt model-side changes (sync refetches after a sent message or
        // upload). Server-owned collections land even while property edits
        // are pending — the optimistic message row waits for the real one
        // (with its attachments) to replace it.
        .onChange(of: model?.tickets.first { $0.id == ticket.id }) { _, fresh in
            guard let fresh, fresh != ticket else { return }
            if ticket == baseline {
                ticket = fresh
                baseline = fresh
            } else {
                adoptServerCollections(from: fresh, into: &ticket)
                if var pending = baseline {
                    adoptServerCollections(from: fresh, into: &pending)
                    baseline = pending
                }
            }
        }
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
        .toolbar {
            ToolbarItem(placement: .principal) {
                HStack(spacing: 6) {
                    Text(ticket.id)
                        .font(.tkMono(12))
                        .foregroundStyle(TK.text3)
                    TKDot(color: ticket.org.color, size: 6)
                    Text(ticket.org.name)
                        .font(.system(size: 13))
                        .foregroundStyle(TK.text2)
                        .lineLimit(1)
                }
            }
            ToolbarItem(placement: .topBarTrailing) {
                moreMenu
            }
        }
        // Session mini bar sits above the composer (inner inset first).
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let model, model.session.isRunning {
                TKSessionMiniBar(model: model)
                    .padding(.horizontal, 8)
                    .padding(.bottom, 8)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            composer
        }
        .sheet(item: $picker) { which in
            pickerSheet(which)
        }
        .sheet(isPresented: $showingConvert) {
            // The regular task-creation sheet, seeded from the ticket — only
            // the submit path differs (convert endpoint links the two).
            CreateTaskSheet(
                tasks: model?.tasks ?? [],
                model: model,
                initialTitle: ticket.subject,
                initialPriority: ticket.priority,
                footer:
                    "Open checklist items and attachments carry over; an internal note links the task on the ticket.",
                navTitle: "Create Task",
                allowsAttachments: false
            ) { task, _ in
                guard let uuid = ticket.uuid,
                      let key = model?.projects.first(where: { $0.name == task.project })?.key
                else {
                    print("[convert] no ticket uuid or unresolved project '\(task.project)'")
                    return
                }
                model?.sync?.convertTicketToTask(
                    ticketUUID: uuid,
                    title: task.title,
                    projectKey: key,
                    description: task.details.isEmpty ? nil : task.details,
                    status: task.status,
                    priority: task.priority,
                    type: task.type,
                    due: task.due,
                    estimate: task.estimate,
                    assignees: task.assignees
                )
            }
        }
        .sheet(isPresented: $showingAttachments) {
            // Sample rows have no server id — the sheet falls back to its
            // disabled/empty state without a model. Anyone may upload to a
            // ticket; the server refuses non-staff deletes.
            AttachmentsSheet(
                entityType: .ticket,
                entityId: ticket.uuid ?? "",
                model: ticket.uuid == nil ? nil : model,
                canDelete: model?.isStaff ?? false
            )
        }
        .sheet(isPresented: $showingAddTag) {
            AddTagSheet(
                existingTags: ticket.tags,
                allTags: (model?.tickets ?? TicketItem.samples).flatMap(\.tags)
            ) { tag in
                ticket.tags.append(tag)
            }
        }
        .sheet(isPresented: $confirmingDelete) {
            ConfirmSheet(
                title: "Delete \(ticket.id)? This can't be undone.",
                actions: [
                    .init(label: "Delete Ticket", style: .destructive) {
                        model?.sync?.deleteTicket(ticket)
                        dismiss()
                    }
                ]
            )
        }
    }

    // MARK: - Nav bar menu

    private var moreMenu: some View {
        Menu {
            Button {
                showingAttachments = true
            } label: {
                Label("Attachments", systemImage: "paperclip")
            }
            Button {
                showingAddTag = true
            } label: {
                Label("Add tag", systemImage: "tag")
            }
            if ticket.checklist.isEmpty, !showingChecklist {
                Button {
                    withAnimation(.snappy(duration: 0.2)) { showingChecklist = true }
                } label: {
                    Label("Add checklist", systemImage: "checklist")
                }
            }
            if isStaff {
                Button {
                    showingConvert = true
                } label: {
                    Label("Create task from ticket", systemImage: "checkmark.circle")
                }
                Divider()
                Button(role: .destructive) {
                    confirmingDelete = true
                } label: {
                    Label("Delete ticket", systemImage: "trash")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(TK.text)
                .frame(width: 36, height: 36)
                .contentShape(.rect)
        }
    }

    // MARK: - Chips

    private var chips: some View {
        ChipFlow {
            Button {
                picker = .status
            } label: {
                PropertyChip(chevron: true) {
                    TKDot(color: ticket.status.color)
                    Text(ticket.status.label)
                }
            }
            .buttonStyle(.plain)

            Button {
                picker = .priority
            } label: {
                PropertyChip(chevron: true) {
                    PriorityBars(priority: ticket.priority)
                    Text(ticket.priority.label)
                }
            }
            .buttonStyle(.plain)

            Button {
                if isStaff { picker = .category }
            } label: {
                PropertyChip(chevron: isStaff) {
                    TKDot(color: ticket.category.color)
                    Text(ticket.category.label)
                }
            }
            .buttonStyle(.plain)
            .disabled(!isStaff)

            Button {
                picker = .assignees
            } label: {
                if ticket.assignees.isEmpty {
                    PropertyChip(style: .empty, chevron: true) {
                        Image(systemName: "person")
                            .font(.system(size: 12))
                        Text("Unassigned")
                    }
                } else {
                    PropertyChip(chevron: true, leadingInset: 9) {
                        AvatarStack(users: ticket.assignees, size: 22)
                        Text(ticket.assignees.count == 1
                             ? ticket.assignees[0].name
                             : "\(ticket.assignees.count) assignees")
                    }
                }
            }
            .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private func pickerSheet(_ which: Picker) -> some View {
        switch which {
        case .status:
            TKPickerSheet(
                title: "Status",
                options: TicketStatus.allCases.map { status in
                    TKPickerOption(status, label: status.label) { TKPickerIcon.dot(status.color) }
                },
                selected: ticket.status
            ) { ticket.status = $0 }
        case .priority:
            TKPickerSheet(
                title: "Priority",
                options: TaskPriority.ticketCases.map { priority in
                    TKPickerOption(priority, label: priority.label) {
                        PriorityBars(priority: priority).frame(width: 26)
                    }
                },
                selected: ticket.priority
            ) { ticket.priority = $0 }
        case .category:
            TKPickerSheet(
                title: "Category",
                options: TicketCategory.allCases.map { category in
                    TKPickerOption(category, label: category.label) { TKPickerIcon.dot(category.color) }
                },
                selected: ticket.category
            ) { ticket.category = $0 }
        case .assignees:
            TKMultiPickerSheet(
                title: "Assignees",
                options: users.map { user in
                    TKPickerOption(user, label: user.name) { TKPickerIcon.avatar(user) }
                },
                selected: Set(ticket.assignees),
                searchable: users.count > 6,
                searchPlaceholder: "Search people…"
            ) { user in
                if ticket.assignees.contains(user) {
                    ticket.assignees.removeAll { $0 == user }
                } else {
                    ticket.assignees.append(user)
                }
            }
        }
    }

    // MARK: - Action strip

    private var actionStrip: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button {
                    showingAddTag = true
                } label: {
                    PropertyChip(style: .empty) {
                        Image(systemName: "plus")
                            .font(.system(size: 12, weight: .semibold))
                        Text("Tags")
                        ForEach(ticket.tags, id: \.self) { tag in
                            TagChip(tag: tag)
                        }
                    }
                }
                .buttonStyle(.plain)
                .contextMenu {
                    ForEach(ticket.tags, id: \.self) { tag in
                        Button(role: .destructive) {
                            ticket.tags.removeAll { $0 == tag }
                        } label: {
                            Label("Remove \(tag)", systemImage: "trash")
                        }
                    }
                }

                if isStaff {
                    Button {
                        showingConvert = true
                    } label: {
                        PropertyChip(style: .empty) {
                            Image(systemName: "plus")
                                .font(.system(size: 12, weight: .semibold))
                            Text("Create task")
                        }
                    }
                    .buttonStyle(.plain)
                }

                Button {
                    showingAttachments = true
                } label: {
                    PropertyChip(style: attachments.isEmpty ? .empty : .filled) {
                        Image(systemName: "paperclip")
                            .font(.system(size: 12, weight: .medium))
                        Text("Attach")
                        if !attachments.isEmpty {
                            Text("\(attachments.count)")
                                .font(.tkMono(13))
                                .foregroundStyle(TK.text2)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, TK.gutter)
        }
        .padding(.horizontal, -TK.gutter)
    }

    // MARK: - Cards

    private var detailsCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            TKSectionLabel("Details")
            VStack(spacing: 0) {
                TKRow(label: "Customer") {
                    if let customer = ticket.customer {
                        HStack(spacing: 8) {
                            AvatarView(user: customer, size: 22)
                            Text(customer.name)
                                .font(.system(size: 14))
                                .foregroundStyle(TK.text2)
                        }
                    } else {
                        Text("—").font(.system(size: 14)).foregroundStyle(TK.text4)
                    }
                }
                TKHairline()
                TKRow(label: "Channel") {
                    HStack(spacing: 6) {
                        Image(systemName: ticket.channel.systemImage)
                            .font(.system(size: 12))
                            .foregroundStyle(TK.text3)
                        Text(ticket.channel.label)
                            .font(.system(size: 14))
                            .foregroundStyle(TK.text2)
                    }
                }
                TKHairline()
                TKRow(label: "First response") {
                    Text(ticket.firstResponseAt.map(\.relativeShort) ?? "—")
                        .font(.tkMono(13))
                        .foregroundStyle(ticket.firstResponseAt == nil ? TK.text4 : TK.text2)
                }
                TKHairline()
                TKRow(label: "Created") {
                    Text(ticket.createdAt.formatted(.dateTime.day().month(.abbreviated).year()))
                        .font(.tkMono(13))
                        .foregroundStyle(TK.text2)
                }
            }
            .tkCard(radius: TK.rCardSm, padding: nil)
        }
    }

    /// Tasks converted out of this ticket — each row jumps to the Tasks tab
    /// and pushes the task's detail.
    private var linkedTasksCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            TKSectionLabel("Linked tasks")
            VStack(spacing: 0) {
                ForEach(Array(ticket.linkedTasks.enumerated()), id: \.element.uuid) { index, link in
                    if index > 0 { TKHairline() }
                    Button {
                        guard let model,
                              let task = model.tasks.first(where: {
                                  $0.uuid == link.uuid || $0.id == link.displayId
                              })
                        else { return }
                        model.open(task)
                    } label: {
                        HStack(spacing: 10) {
                            StatusDot(status: link.status, size: 16)
                            Text(link.displayId)
                                .font(.tkMono(12))
                                .foregroundStyle(TK.text3)
                            Text(link.title)
                                .font(.system(size: 14, weight: .medium))
                                .foregroundStyle(TK.text)
                                .lineLimit(1)
                            Spacer(minLength: 6)
                            TKDisclosure()
                        }
                        .padding(.horizontal, 14)
                        .frame(minHeight: 48)
                        .contentShape(.rect)
                    }
                    .buttonStyle(TKPressStyle())
                }
            }
            .tkCard(radius: TK.rCardSm, padding: nil)
        }
    }

    private var checklistSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                TKSectionLabel("Checklist")
                if ticket.checklistTotal > 0 {
                    Text("\(ticket.checklistDone)/\(ticket.checklistTotal)")
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                    TKBar(fraction: Double(ticket.checklistDone) / Double(ticket.checklistTotal),
                          color: TK.success, width: 80)
                }
            }
            ChecklistCard(items: $ticket.checklist)
        }
    }

    // MARK: - Composer

    private var composer: some View {
        VStack(spacing: 8) {
            TKHairline(color: TK.hairlineStrong)
            MessageComposer(
                text: $draft,
                placeholder: internalNote ? "Internal note…" : "Reply to customer…",
                mentionCandidates: (model?.assignableUsers ?? []) + ticket.messages.map(\.user),
                onSendFiles: send,
                accent: internalNote ? TK.amber : nil
            )
            .padding(.top, 2)
            if isStaff {
                HStack(spacing: 10) {
                    TKSegmented(
                        options: [false, true], selection: $internalNote,
                        selectedTint: internalNote ? TK.amber : nil
                    ) { option in
                        Text(option ? "Internal note" : "Public")
                    }
                    Text(internalNote ? "Only your team sees this" : "Visible to the client")
                        .font(.tkMetaSm)
                        .foregroundStyle(TK.text3)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                }
                .padding(.horizontal, TK.gutter)
            }
        }
        .padding(.bottom, 8)
        .background(TK.bg)
        .animation(.snappy(duration: 0.2), value: internalNote)
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
        // Messages are server-owned: mirror them into the baseline so the
        // optimistic row doesn't trigger a property PATCH on disappear.
        baseline?.messages = ticket.messages
        baseline?.firstResponseAt = ticket.firstResponseAt
        if let uuid = ticket.uuid {
            model?.sync?.sendTicketMessage(
                ticketUUID: uuid, text: text, internalNote: internalNote, files: files
            )
        }
        draft = ""
        internalNote = false
    }

    // MARK: - Persistence

    private func logActivity(_ text: String, icon: String) {
        ticket.activity.append(
            ActivityEvent(user: model?.me ?? TaskItem.sampleUsers[0], date: .now,
                          text: text, icon: icon)
        )
    }

    /// Checklist edits go to their own participant-editable endpoint, not
    /// the agent-only property PATCH — and keep `baseline` in sync so a
    /// later persist() doesn't re-push properties for a checklist change.
    private func persistChecklist() {
        guard let model else { return }
        if let index = model.tickets.firstIndex(where: { $0.id == ticket.id }) {
            model.tickets[index].checklist = ticket.checklist
        }
        baseline?.checklist = ticket.checklist
        model.sync?.pushTicketChecklist(ticket)
    }

    /// The fields only the server writes (never edited locally, only
    /// appended optimistically) — safe to take wholesale.
    private func adoptServerCollections(from fresh: TicketItem, into target: inout TicketItem) {
        target.messages = fresh.messages
        target.activity = fresh.activity
        target.attachments = fresh.attachments
        target.linkedTasks = fresh.linkedTasks
        target.firstResponseAt = fresh.firstResponseAt
        target.serverMessageCount = fresh.serverMessageCount
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
}

#Preview("Detail") {
    NavigationStack {
        TicketDetailView(ticket: TicketItem.samples[1])
    }
    .preferredColorScheme(.dark)
}

#Preview("With session") {
    let model = AppModel()
    model.startSession(for: TaskItem.samples[0])
    model.showingPlayer = false
    return NavigationStack {
        TicketDetailView(ticket: TicketItem.samples[0], model: model)
    }
    .preferredColorScheme(.dark)
}
