//
//  TaskDetailView.swift
//  trackr-mobile-ios
//
//  Mobile version of the web task Inspector in the prototype's layout:
//  key/project line, editable title, property chips (each opens a picker
//  sheet), description, checklist, time card with quick logs, session
//  card, tags/attachments, and the activity timeline (comments, time logs,
//  typed events) with the comment composer pinned at the bottom.
//
//  Edits mutate a local copy; chip edits push immediately, free text
//  persists when the screen closes (see `PersistedFields`).
//

import SwiftUI

struct TaskDetailView: View {
    @State var task: TaskItem
    /// nil in previews; the real app passes it so edits persist + push.
    var model: AppModel? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var baseline: TaskItem?
    @State private var editingDescription = false
    @FocusState private var descriptionFocused: Bool
    @State private var deleted = false

    /// The shared model's copy of this task — nil in previews.
    private var modelCopy: TaskItem? {
        model?.tasks.first { $0.id == task.id }
    }

    @State private var showingTimeLog = false
    @State private var showingAddTag = false
    @State private var showingAttachments = false
    @State private var confirmingDelete = false
    @State private var field: Field?
    @State private var draft = ""

    /// Which property chip's picker sheet is up.
    private enum Field: String, Identifiable {
        case type, status, priority, assignee, due, planned, estimate
        var id: String { rawValue }
    }

    private var me: UserRef { model?.me ?? TaskItem.sampleUsers[0] }

    private var projectColor: Color {
        model?.projects.first { $0.name == task.project }?.color ?? TK.text3
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 24) {
                    header
                    if let source = task.sourceTicket {
                        sourceTicketBanner(source)
                    }
                    descriptionField
                    checklistSection
                    timeSection
                    if !task.tags.isEmpty {
                        tagsSection
                    }
                    attachmentsSection
                    activitySection
                }
                .padding(.horizontal, TK.gutter)
                .padding(.top, 6)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            .onChange(of: task.comments.count) {
                if let last = events.last {
                    withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                }
            }
        }
        // Session mini bar sits above the composer (inner inset first).
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if let model, model.session.isRunning {
                TKSessionMiniBar(model: model)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 6)
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            composer
        }
        // One snapshot-typed trigger instead of a per-field onChange stack:
        // keeps the modifier chain type-checkable and excludes the free-text
        // fields (title/description persist on disappear, not per keystroke).
        // Chip edits land on the activity timeline, like the web's typed
        // Inspector events.
        .onChange(of: PersistedFields(task)) { old, new in
            if old.status != new.status {
                logActivity("changed status to \(new.status.label)",
                            icon: "arrow.triangle.2.circlepath")
            }
            if old.priority != new.priority {
                logActivity("changed priority to \(new.priority.label)", icon: "flag")
            }
            persist()
        }
        .onAppear {
            baseline = task
            // Screen-appear revalidation: pull the freshest detail (and the
            // assignable-users directory) without blocking the cached render.
            if let uuid = task.uuid, let model {
                Task {
                    await model.sync?.loadTaskDetail(uuid: uuid)
                    if baseline == task,
                       let fresh = model.tasks.first(where: { $0.uuid == uuid })
                    {
                        task = fresh
                        baseline = fresh
                    }
                }
            }
        }
        // Adopt model-side changes (session finish logs time/status/notes,
        // sync refetches, row check toggles) as long as there are no
        // unsaved local edits.
        .onChange(of: modelCopy) { _, fresh in
            guard let fresh, fresh != task else { return }
            if task == baseline {
                task = fresh
                baseline = fresh
            } else {
                // Property edits pending — still take the server-owned
                // collections so an optimistically appended comment is
                // replaced by the real one (with its attachments).
                adoptServerCollections(from: fresh, into: &task)
                if var pending = baseline {
                    adoptServerCollections(from: fresh, into: &pending)
                    baseline = pending
                }
            }
        }
        .onDisappear { persist() }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                moreMenu
            }
        }
        .sheet(item: $field) { field in
            pickerSheet(for: field)
        }
        .sheet(isPresented: $showingTimeLog) {
            TimeLogSheet(task: task, me: me) { log in
                addTimeLog(log)
            }
        }
        .sheet(isPresented: $showingAddTag) {
            AddTagSheet(
                existingTags: task.tags,
                allTags: (model?.tasks ?? TaskItem.samples).flatMap(\.tags)
            ) { tag in
                task.tags.append(tag)
            }
        }
        .sheet(isPresented: $showingAttachments) {
            // Sample rows have no server id — the sheet falls back to its
            // disabled/empty state without a model.
            AttachmentsSheet(
                entityType: .task,
                entityId: task.uuid ?? "",
                model: task.uuid == nil ? nil : model
            )
        }
        .sheet(isPresented: $confirmingDelete) {
            ConfirmSheet(
                title: "Delete \(task.id)? This can't be undone.",
                actions: [
                    .init(label: "Delete task", style: .destructive) {
                        deleted = true
                        if let sync = model?.sync {
                            sync.deleteTask(task)
                        } else {
                            model?.tasks.removeAll { $0.id == task.id }
                        }
                        dismiss()
                    }
                ]
            )
        }
    }

    /// The fields whose edits push immediately (title/description are
    /// excluded on purpose — they persist when the screen closes).
    private struct PersistedFields: Equatable {
        let status: TaskStatus
        let priority: TaskPriority
        let type: TaskType
        let assignees: [UserRef]
        let due: Date?
        let plannedFor: Date?
        let estimate: Int?
        let tags: [String]
        let checklist: [ChecklistItem]

        init(_ task: TaskItem) {
            status = task.status
            priority = task.priority
            type = task.type
            assignees = task.assignees
            due = task.due
            plannedFor = task.plannedFor
            estimate = task.estimate
            tags = task.tags
            checklist = task.checklist
        }
    }

    // MARK: - Nav bar

    /// Everything the old toolbar offered, behind one ellipsis.
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
            Button {
                showingTimeLog = true
            } label: {
                Label("Log time", systemImage: "clock")
            }
            if let model, !model.session.isRunning {
                Button {
                    model.startSession(for: task)
                } label: {
                    Label("Start session", systemImage: "play")
                }
            }
            if model != nil {
                Divider()
                Button(role: .destructive) {
                    confirmingDelete = true
                } label: {
                    Label("Delete task", systemImage: "trash")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.system(size: 15, weight: .semibold))
                .foregroundStyle(TK.text)
                .frame(width: 36, height: 36)
                .contentShape(.rect)
        }
        .accessibilityLabel("More")
    }

    // MARK: - Header

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 6) {
                Text(task.id)
                    .font(.tkMono(12))
                    .foregroundStyle(TK.text3)
                Circle()
                    .fill(projectColor)
                    .frame(width: 6, height: 6)
                Text(task.project)
                    .font(.tkMeta)
                    .foregroundStyle(TK.text3)
                    .lineLimit(1)
            }
            TextField("", text: $task.title, prompt: Text("Task title").foregroundStyle(TK.text4), axis: .vertical)
                .font(.tkDetailTitle)
                .foregroundStyle(task.status == .done ? TK.text2 : TK.text)
                .strikethrough(task.status == .done, color: TK.text3)
                .lineSpacing(2)
            ChipFlow {
                chipButton(.type) {
                    TypeBadge(type: task.type, showLabel: false)
                    Text(task.type.label)
                }
                chipButton(.status) {
                    StatusDot(status: task.status, size: 18)
                    Text(task.status.label)
                }
                chipButton(.priority) {
                    PriorityBars(priority: task.priority)
                    Text(task.priority.label)
                }
                assigneeChip
                dueChip
                plannedChip
                estimateChip
            }
        }
        .padding(.top, 4)
    }

    private func chipButton<Content: View>(
        _ target: Field, style: PropertyChipStyle = .filled, leadingInset: CGFloat = 10,
        @ViewBuilder content: @escaping () -> Content
    ) -> some View {
        Button {
            field = target
        } label: {
            PropertyChip(style: style, chevron: true, leadingInset: leadingInset, content: content)
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private var assigneeChip: some View {
        if task.assignees.isEmpty {
            chipButton(.assignee, style: .empty, leadingInset: 12) {
                Image(systemName: "person")
                    .font(.system(size: 12))
                Text("Unassigned")
            }
        } else {
            chipButton(.assignee, leadingInset: 8) {
                AvatarStack(users: task.assignees, size: 24)
                Text(task.assignees.count == 1
                     ? task.assignees[0].name
                     : "\(task.assignees.count) assignees")
            }
        }
    }

    @ViewBuilder
    private var dueChip: some View {
        if let due = task.due {
            chipButton(.due, leadingInset: 12) {
                Image(systemName: "calendar")
                    .font(.system(size: 12))
                    .foregroundStyle(TK.text2)
                Text(due.formatted(.dateTime.day().month(.abbreviated)))
                    .font(.tkMono(14))
                if let countdown = task.dueCountdown {
                    Text("· \(countdown.label)")
                        .font(.system(size: 13))
                        .foregroundStyle(countdown.tone.color ?? TK.text2)
                }
            }
        } else {
            chipButton(.due, style: .empty, leadingInset: 12) {
                Image(systemName: "calendar")
                    .font(.system(size: 12))
                Text("Due date")
            }
        }
    }

    @ViewBuilder
    private var plannedChip: some View {
        if let planned = task.plannedFor {
            chipButton(.planned, style: .accent, leadingInset: 12) {
                Image(systemName: "bookmark")
                    .font(.system(size: 12))
                Text(planned.formatted(.dateTime.day().month(.abbreviated)))
                    .font(.tkMono(14))
            }
        } else {
            chipButton(.planned, style: .empty, leadingInset: 12) {
                Image(systemName: "bookmark")
                    .font(.system(size: 12))
                Text("Plan for")
            }
        }
    }

    @ViewBuilder
    private var estimateChip: some View {
        if let estimate = task.estimate {
            chipButton(.estimate, leadingInset: 12) {
                Text("Est")
                    .foregroundStyle(TK.text2)
                Text(estimate.minutesFormatted)
                    .font(.tkMono(14))
            }
        } else {
            chipButton(.estimate, style: .empty, leadingInset: 12) {
                Image(systemName: "timer")
                    .font(.system(size: 12))
                Text("Estimate")
            }
        }
    }

    // MARK: - Pickers

    @ViewBuilder
    private func pickerSheet(for field: Field) -> some View {
        switch field {
        case .type:
            TKPickerSheet(
                title: "Type",
                options: TaskType.allCases.map { type in
                    TKPickerOption(type, label: type.label) { TypeBadge(type: type, showLabel: false) }
                },
                selected: task.type
            ) { task.type = $0 }
        case .status:
            TKPickerSheet(
                title: "Status",
                options: TaskStatus.allCases.map { status in
                    TKPickerOption(status, label: status.label) { StatusDot(status: status, size: 18) }
                },
                selected: task.status
            ) { task.status = $0 }
        case .priority:
            TKPickerSheet(
                title: "Priority",
                options: TaskPriority.allCases.map { priority in
                    TKPickerOption(priority, label: priority.label) {
                        PriorityBars(priority: priority).frame(width: 26)
                    }
                },
                selected: task.priority
            ) { task.priority = $0 }
        case .assignee:
            TKMultiPickerSheet(
                title: "Assignees",
                options: assigneeOptions.map { user in
                    TKPickerOption(user, label: user.name) { TKPickerIcon.avatar(user) }
                },
                isSelected: { user in task.assignees.contains { $0.sameUser(as: user) } },
                searchable: assigneeOptions.count > 8,
                searchPlaceholder: "Search people…"
            ) { user in
                if let index = task.assignees.firstIndex(where: { $0.sameUser(as: user) }) {
                    task.assignees.remove(at: index)
                } else {
                    task.assignees.append(user)
                }
            }
        case .due:
            TKDatePickerSheet(title: "Due date", selected: task.due) { task.due = $0 }
        case .planned:
            TKDatePickerSheet(title: "Plan for", selected: task.plannedFor) { task.plannedFor = $0 }
        case .estimate:
            TKPickerSheet(
                title: "Estimate",
                options: EstimateOptions.all.map { option in
                    TKPickerOption(option.minutes, label: option.label)
                },
                selected: task.estimate
            ) { task.estimate = $0 }
        }
    }

    /// Directory first, then any assignee the task already carries that the
    /// directory doesn't know (sample data, deactivated users).
    private var assigneeOptions: [UserRef] {
        var users = model?.assignableUsers ?? TaskItem.sampleUsers
        for assignee in task.assignees where !users.contains(where: { $0.sameUser(as: assignee) }) {
            users.append(assignee)
        }
        return users
    }

    // MARK: - Sections

    /// Back-link to the ticket this task was converted from — jumps to the
    /// Tickets tab and pushes the ticket's detail.
    private func sourceTicketBanner(_ source: ConversionLink) -> some View {
        Button {
            guard let model,
                  let ticket = model.tickets.first(where: { $0.uuid == source.uuid })
            else { return }
            model.selectedTab = .tickets
            model.ticketPath = [ticket]
        } label: {
            HStack(spacing: 10) {
                RoundedRectangle(cornerRadius: 1.5)
                    .fill(TK.amber)
                    .frame(width: 3)
                Image(systemName: "ticket")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(TK.amber)
                Text("Created from")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(TK.text)
                Text(source.displayId)
                    .font(.tkMono(13))
                    .foregroundStyle(TK.text2)
                Spacer()
                TKDisclosure()
            }
            .padding(.leading, 10)
            .padding(.trailing, 14)
            .padding(.vertical, 10)
            .frame(minHeight: 44)
            .background(TK.amber.opacity(0.07), in: .rect(cornerRadius: TK.rChip))
            .overlay(RoundedRectangle(cornerRadius: TK.rChip).strokeBorder(TK.amber.opacity(0.3), lineWidth: 1))
            .contentShape(.rect)
        }
        .buttonStyle(TKScaleStyle())
    }

    /// Rendered markdown; tapping it (or an empty description) opens the
    /// raw editor, "Done" returns to the rendered view.
    @ViewBuilder
    private var descriptionField: some View {
        if editingDescription || task.details.isEmpty {
            VStack(alignment: .trailing, spacing: 6) {
                TextField(
                    "", text: $task.details,
                    prompt: Text("Add a description…").foregroundStyle(TK.text4),
                    axis: .vertical
                )
                .font(.system(size: 15))
                .foregroundStyle(TK.textBody)
                .lineSpacing(4)
                .focused($descriptionFocused)
                if editingDescription {
                    TKQuietButton(title: "Done", color: TK.accent, weight: .medium) {
                        editingDescription = false
                        descriptionFocused = false
                    }
                }
            }
        } else {
            Button {
                editingDescription = true
                descriptionFocused = true
            } label: {
                RichContentView(markdown: task.details)
                    .contentShape(.rect)
            }
            .buttonStyle(.plain)
        }
    }

    private var checklistSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                TKSectionLabel("Checklist")
                Spacer()
                if task.checklistTotal > 0 {
                    Text("\(task.checklistDone)/\(task.checklistTotal)")
                        .font(.tkMono(12))
                        .foregroundStyle(TK.text3)
                    TKBar(
                        fraction: Double(task.checklistDone) / Double(task.checklistTotal),
                        color: TK.success, height: 4, width: 80
                    )
                }
            }
            ChecklistCard(items: $task.checklist)
        }
    }

    private var timeSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            TKSectionLabel("Time")
            timeCard
            if let model {
                sessionCard(model)
            }
        }
    }

    /// Logged vs. estimate with quick +30m / +1h logs; the title opens the
    /// full time-log sheet.
    private var timeCard: some View {
        let logged = task.loggedMinutes
        let estimate = task.estimate
        let over = estimate.map { logged > $0 } ?? false
        return VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Button {
                    showingTimeLog = true
                } label: {
                    HStack(spacing: 6) {
                        Text("Log time")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundStyle(TK.text)
                        TKChevron(direction: .right)
                    }
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                Spacer()
                HStack(spacing: 0) {
                    Text(logged > 0 ? logged.minutesFormatted : "0m")
                        .foregroundStyle(over ? TK.danger : TK.text)
                    Text(" / \(estimate.map(\.minutesFormatted) ?? "—")")
                        .foregroundStyle(TK.text3)
                }
                .font(.tkMono(13))
            }
            if let estimate, estimate > 0 {
                TKBar(
                    fraction: Double(logged) / Double(estimate),
                    color: over ? TK.danger : TK.success, height: 4
                )
            }
            HStack(spacing: 8) {
                TKSecondaryButton(title: "+30m", fill: TK.bg, height: 36) { quickLog(30) }
                TKSecondaryButton(title: "+1h", fill: TK.bg, height: 36) { quickLog(60) }
                Spacer()
            }
        }
        .tkCard(radius: TK.rCardSm)
    }

    /// Start a work session bound to this task — Done logs time + notes
    /// here. While this task's session runs, the row shows the live clock;
    /// while another one runs, it says so.
    @ViewBuilder
    private func sessionCard(_ model: AppModel) -> some View {
        let running = model.session.isRunning
        let thisTask = model.session.taskId == task.id
        Button {
            if thisTask {
                model.showingPlayer = true
            } else if !running {
                model.startSession(for: task)
            }
        } label: {
            HStack(spacing: 12) {
                if thisTask {
                    TKLiveDot(color: model.session.isPaused ? TK.warning : TK.accent,
                              pulsing: !model.session.isPaused)
                        .frame(width: 32, height: 32)
                        .background(TK.bg, in: .rect(cornerRadius: 9))
                    Text(model.session.isPaused ? "Paused" : "Recording")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(TK.text)
                    Spacer()
                    SessionClock(session: model.session)
                        .font(.tkMono(20, weight: .medium))
                        .foregroundStyle(model.session.isPaused ? TK.warning : TK.accent)
                } else {
                    Image(systemName: "play.fill")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(running ? TK.text4 : TK.accent)
                        .frame(width: 32, height: 32)
                        .background(running ? TK.mono(0.06) : TK.accentSoft, in: .rect(cornerRadius: 9))
                    Text(running ? "Another session is running" : "Start session")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundStyle(running ? TK.text3 : TK.text)
                    Spacer()
                    if !running {
                        TKDisclosure()
                    }
                }
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 56)
            .tkCard(radius: TK.rCardSm, padding: nil)
            .contentShape(.rect)
        }
        .buttonStyle(TKScaleStyle())
        .disabled(running && !thisTask)
    }

    private var tagsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            TKSectionLabel("Tags")
            ChipFlow(spacing: 6) {
                ForEach(task.tags, id: \.self) { tag in
                    TagChip(tag: tag)
                        .contextMenu {
                            Button(role: .destructive) {
                                task.tags.removeAll { $0 == tag }
                            } label: {
                                Label("Remove", systemImage: "trash")
                            }
                        }
                }
                Button {
                    showingAddTag = true
                } label: {
                    Text("+ Tag")
                        .font(.tkMono(11))
                        .foregroundStyle(TK.text3)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .overlay(
                            RoundedRectangle(cornerRadius: 5)
                                .strokeBorder(TK.borderDashed, style: StrokeStyle(lineWidth: 1, dash: [3, 2]))
                        )
                        .contentShape(.rect)
                }
                .buttonStyle(.plain)
            }
        }
    }

    @ViewBuilder
    private var attachmentsSection: some View {
        // The model row is the live copy — uploads from the sheet merge in
        // there, not into the local edit buffer.
        let attachments = modelCopy?.attachments ?? task.attachments
        if !attachments.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    TKSectionLabel("Attachments")
                    Spacer()
                    Text("\(attachments.count)")
                        .font(.tkMono(12))
                        .foregroundStyle(TK.text3)
                }
                VStack(alignment: .leading, spacing: 10) {
                    AttachmentListView(
                        attachments: attachments,
                        onDelete: task.uuid.map { uuid in
                            { attachment in
                                model?.sync?.deleteAttachment(
                                    attachment, entityType: .task, entityId: uuid
                                )
                            }
                        }
                    )
                    if task.uuid != nil {
                        TKQuietButton(title: "Add files", color: TK.accent, weight: .medium) {
                            showingAttachments = true
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .tkCard(radius: TK.rCardSm)
            }
        }
    }

    // MARK: - Activity

    private enum Event: Identifiable {
        case comment(TaskComment)
        case time(TimeLog)
        case activity(ActivityEvent)

        var id: String {
            switch self {
            case .comment(let c): c.id
            case .time(let t): t.id
            case .activity(let a): a.id.uuidString
            }
        }

        var date: Date {
            switch self {
            case .comment(let c): c.date
            case .time(let t): t.date
            case .activity(let a): a.date
            }
        }
    }

    private var events: [Event] {
        (task.comments.map(Event.comment)
            + task.timeLogs.map(Event.time)
            + task.activity.map(Event.activity))
            .sorted { $0.date < $1.date }
    }

    private var activitySection: some View {
        VStack(alignment: .leading, spacing: 14) {
            TKSectionLabel("Activity")
            VStack(alignment: .leading, spacing: 18) {
                ForEach(events) { event in
                    row(for: event).id(event.id)
                }
                if events.isEmpty {
                    Text("No activity yet.")
                        .font(.system(size: 14))
                        .foregroundStyle(TK.text3)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            // The rail: a hairline behind the node column — only once
            // there is a column to sit behind.
            .background(alignment: .leading) {
                if events.count > 1 {
                    Rectangle()
                        .fill(TK.border)
                        .frame(width: 1)
                        .offset(x: TimelineRow<EmptyView>.nodeSize / 2)
                        .padding(.vertical, 14)
                }
            }
            if let created = task.createdAt {
                HStack(spacing: 4) {
                    Text("Created")
                    Text(created.formatted(.dateTime.day().month(.abbreviated).year()))
                        .font(.tkMono(12))
                }
                .font(.tkMeta)
                .foregroundStyle(TK.text3)
                .padding(.top, 4)
            }
        }
    }

    @ViewBuilder
    private func row(for event: Event) -> some View {
        switch event {
        case .comment(let comment):
            TimelineRow(
                node: .avatar(comment.user),
                name: comment.user.name,
                action: "commented",
                date: comment.date
            ) {
                MessageCard(
                    text: comment.text, attachments: comment.attachments,
                    pendingFiles: comment.pendingFiles
                )
            }
        case .time(let log):
            TimelineRow(
                node: .icon("clock"),
                name: log.user.name,
                action: "logged \(log.minutes.minutesFormatted)",
                date: log.date
            ) {
                if let note = log.note {
                    Text(note)
                        .font(.system(size: 14))
                        .italic()
                        .foregroundStyle(TK.text2)
                }
            }
        case .activity(let event):
            TimelineRow(
                node: .icon(event.icon),
                name: event.user.name,
                action: event.text,
                date: event.date
            )
        }
    }

    private var composer: some View {
        VStack(spacing: 0) {
            TKHairline(color: TK.border)
            MessageComposer(
                text: $draft,
                placeholder: "Write a comment…",
                mentionCandidates: (model?.assignableUsers ?? []) + task.comments.map(\.user),
                onSendFiles: send
            )
            .padding(.vertical, 8)
        }
        .background(TK.bg)
    }

    // MARK: - Helpers

    private func send(files: [PickedFile]) {
        let text = draft.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        task.comments.append(
            TaskComment(user: me, date: .now, text: text, pendingFiles: files)
        )
        draft = ""
        if let uuid = task.uuid {
            model?.sync?.sendTaskComment(taskUUID: uuid, text: text, files: files)
        }
    }

    /// Optimistic append + server log — the sheet and the quick buttons
    /// share this path.
    private func addTimeLog(_ log: TimeLog) {
        task.timeLogs.append(log)
        if let uuid = task.uuid {
            model?.sync?.logTime(
                taskUUID: uuid, minutes: log.minutes, date: log.date, note: log.note
            )
        }
    }

    private func quickLog(_ minutes: Int) {
        addTimeLog(TimeLog(user: me, minutes: minutes, date: .now))
        model?.toast("Logged \(minutes.minutesFormatted)")
    }

    private func logActivity(_ text: String, icon: String) {
        task.activity.append(
            ActivityEvent(user: me, date: .now, text: text, icon: icon)
        )
    }

    /// The fields only the server writes (never edited locally, only
    /// appended optimistically) — safe to take wholesale.
    private func adoptServerCollections(from fresh: TaskItem, into target: inout TaskItem) {
        target.comments = fresh.comments
        target.timeLogs = fresh.timeLogs
        target.activity = fresh.activity
        target.attachments = fresh.attachments
        target.sourceTicket = fresh.sourceTicket
    }

    /// Write the edit back into the shared model and push it to the server.
    /// Compared against the last pushed state so no-op closes don't PATCH.
    private func persist() {
        guard !deleted, task != baseline else { return }
        baseline = task
        guard let model else { return }
        if let index = model.tasks.firstIndex(where: { $0.id == task.id }) {
            model.tasks[index] = task
        }
        model.sync?.pushTask(task)
    }
}

/// Shared elevated-card look (project / ticket details still use it) —
/// now the prototype card.
extension View {
    func cardStyle(padded: Bool = true) -> some View {
        self
            .tkCard(radius: TK.rCard, padding: padded ? 14 : nil)
            // Clip content (e.g. embedded List row backgrounds) to the
            // card's rounded shape.
            .clipShape(.rect(cornerRadius: TK.rCard))
    }
}

#Preview("Detail") {
    let model = AppModel()
    return NavigationStack {
        TaskDetailView(task: model.tasks[0], model: model)
            .tkDetailScreen()
    }
    .preferredColorScheme(.dark)
}

#Preview("Session running") {
    let model = AppModel()
    model.startSession(for: model.tasks[0])
    model.showingPlayer = false
    return NavigationStack {
        TaskDetailView(task: model.tasks[0], model: model)
            .tkDetailScreen()
    }
    .preferredColorScheme(.dark)
}
