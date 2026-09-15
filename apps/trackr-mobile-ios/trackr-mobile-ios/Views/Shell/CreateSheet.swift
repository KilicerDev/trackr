//
//  CreateSheet.swift
//  trackr-mobile-ios
//
//  The "+" sheet: one form that creates a ticket, a task or starts a work
//  session, switched by the "NEW TICKET ▾" label. Scope chip (organization
//  for tickets, project for tasks / sessions), 22pt title, description,
//  property chips, staged attachments, Cancel / Create footer.
//
//  `CreateEntityForm` is the shared body; `CreateSheet` binds it to the
//  shell (`model.createKind`, `createProjectName`, `createOrgKey`, toast),
//  and `CreateTaskSheet` / `CreateTicketSheet` wrap it for the flows that
//  present a single, pre-seeded kind (ticket → task conversion, project
//  page "+").
//

import SwiftUI

struct CreateSheet: View {
    @Bindable var model: AppModel

    var body: some View {
        CreateEntityForm(
            model: model,
            tasks: model.tasks,
            tickets: model.tickets,
            initialKind: model.createKind,
            allowsKindSwitch: true,
            initialProject: model.createProjectName,
            initialOrgKey: model.createOrgKey,
            initialPlannedFor: model.createPlannedFor,
            onCreateTask: { task, files in
                model.addTask(task, files: files)
                model.toast("\(task.id) created")
            },
            onCreateTicket: { ticket, files in
                model.addTicket(ticket, files: files)
                model.toast("\(ticket.id) created")
            }
        )
    }
}

// MARK: - Shared form

struct CreateEntityForm: View {
    var model: AppModel? = nil
    /// Existing tasks / tickets — source for project / org options and the
    /// next display id when no model backs the form (previews, wrappers).
    var tasks: [TaskItem] = []
    var tickets: [TicketItem] = []
    var initialKind: CreateKind = .task
    /// The kind label opens the Ticket / Task / Session picker.
    var allowsKindSwitch = true
    /// Preselected scope (project name for tasks, org key for tickets).
    var initialProject: String? = nil
    var initialOrgKey: String? = nil
    /// Week "+ Add task": the new task is planned for that day.
    var initialPlannedFor: Date? = nil
    /// Seeds for flows that prefill the sheet (ticket → task conversion).
    var initialTitle: String? = nil
    var initialPriority: TaskPriority? = nil
    /// Hint under the fields (the conversion note); nil hides it.
    var footer: String? = nil
    /// Overrides the "NEW TASK" kind label ("CREATE TASK" for conversion).
    var kindLabel: String? = nil
    /// Conversion hides staging — the convert endpoint has no file leg
    /// (the server carries the ticket's own attachments over instead).
    var allowsAttachments = true
    /// Staged files ride along in the same create request (multipart), so
    /// the server can list them in the `*.created` webhook.
    var onCreateTask: ((TaskItem, [PickedFile]) -> Void)? = nil
    var onCreateTicket: ((TicketItem, [PickedFile]) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    @State private var seeded = false
    @State private var kind: CreateKind = .task
    @State private var picker: Picker?

    // Shared fields
    @State private var title = ""
    @State private var details = ""
    @State private var assignees: Set<UserRef> = []
    @State private var staging = FileStaging()

    // Task / session
    @State private var project = ""
    @State private var type: TaskType = .task
    @State private var status: TaskStatus = .todo
    @State private var taskPriority: TaskPriority = .none
    @State private var due: Date?
    @State private var estimate: Int?

    // Ticket
    @State private var org: OrgRef?
    @State private var category: TicketCategory = .general
    @State private var ticketPriority: TaskPriority = .medium

    private enum Picker: String, Identifiable {
        case kind, project, org, type, status, priority, category, assignees, due, estimate
        var id: String { rawValue }
    }

    // MARK: Options

    private var projectOptions: [String] {
        if let model, !model.projects.isEmpty {
            return model.projects.filter { $0.status != .archived }.map(\.name)
        }
        return Set(tasks.map(\.project)).sorted()
    }

    /// Rich picker rows (color + favorite) when a model backs the sheet;
    /// bare names for previews/sample data.
    private var projectChoices: [ProjectChoice] {
        if let model, !model.projects.isEmpty {
            return model.projects
                .filter { $0.status != .archived }
                .map { ProjectChoice(name: $0.name, color: $0.color, isFavorite: $0.isFavorite) }
        }
        return projectOptions.map { ProjectChoice(name: $0) }
    }

    /// Projects with the most recent task activity — the list arrives
    /// server-ordered by recency, so first-seen distinct names suffice.
    private var recentProjectNames: [String] {
        var seen = Set<String>()
        var out: [String] = []
        for item in tasks where !item.project.isEmpty && seen.insert(item.project).inserted {
            out.append(item.project)
            if out.count == 5 { break }
        }
        return out
    }

    private var orgOptions: [OrgRef] {
        if let model, !model.orgs.isEmpty { return model.orgs }
        return Array(Set(tickets.map(\.org))).sorted { $0.name < $1.name }
    }

    private var userOptions: [UserRef] {
        if let model, !model.assignableUsers.isEmpty { return model.assignableUsers }
        let pool = tasks.flatMap(\.assignees) + tickets.flatMap(\.assignees)
        let unique = Array(Set(pool)).sorted { $0.name < $1.name }
        return unique.isEmpty ? TaskItem.sampleUsers : unique
    }

    private var projectColor: Color {
        model?.projects.first(where: { $0.name == project })?.color
            ?? projectChoices.first(where: { $0.name == project })?.color
            ?? TK.text3
    }

    private var projectRef: ProjectRef {
        model?.projects.first(where: { $0.name == project })?.ref
            ?? ProjectRef(name: project, color: projectColor)
    }

    private var trimmedTitle: String { title.trimmingCharacters(in: .whitespaces) }

    private var canCreate: Bool {
        switch kind {
        case .task: !trimmedTitle.isEmpty && !project.isEmpty
        case .ticket: !trimmedTitle.isEmpty && org != nil
        case .session: !project.isEmpty && !(model?.session.isRunning ?? false)
        }
    }

    private var kindTitle: String {
        if let kindLabel { return kindLabel }
        switch kind {
        case .ticket: return "New ticket"
        case .task: return "New task"
        case .session: return "New session"
        }
    }

    private var titlePlaceholder: String {
        switch kind {
        case .ticket: "Ticket title"
        case .task: "Task title"
        case .session: "What are you working on? (optional)"
        }
    }

    // MARK: Body

    var body: some View {
        VStack(spacing: 0) {
            TKSheetHandle()
                .padding(.top, 10)
            header
                .padding(.horizontal, TK.gutter)
                .padding(.top, 12)
                .padding(.bottom, 4)
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    titleField
                    if kind != .session {
                        descriptionField
                    }
                    chips
                    if kind == .session {
                        sessionBlock
                    }
                    if let footer {
                        Text(footer)
                            .font(.system(size: 12))
                            .foregroundStyle(TK.text3)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    if allowsAttachments, kind != .session {
                        StagedFilesSection(staging: $staging)
                            .padding(.top, 4)
                    }
                }
                .padding(.horizontal, TK.gutter)
                .padding(.top, 10)
                .padding(.bottom, 24)
            }
            .scrollDismissesKeyboard(.interactively)
            if kind != .session {
                footerBar
            }
        }
        .background(TK.bgRaised)
        .tkSheet(background: TK.bgRaised, detents: [.large])
        .fileStaging($staging, noun: kind == .ticket ? "ticket" : "task")
        .sheet(item: $picker) { pickerSheet($0) }
        .onAppear(perform: seed)
    }

    // MARK: Header

    private var header: some View {
        HStack(spacing: 10) {
            scopeChip
            Button {
                if allowsKindSwitch { picker = .kind }
            } label: {
                HStack(spacing: 4) {
                    Text(kindTitle.uppercased())
                        .font(.tkSection)
                        .tracking(1.1)
                    if allowsKindSwitch {
                        TKChevron()
                    }
                }
                .foregroundStyle(TK.text3)
                .frame(minHeight: 36)
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .disabled(!allowsKindSwitch)
            Spacer(minLength: 0)
            TKCircleButton(systemImage: "xmark", size: 32) { dismiss() }
        }
    }

    @ViewBuilder
    private var scopeChip: some View {
        switch kind {
        case .ticket:
            TKChipButton(style: .empty, leadingInset: 10) {
                picker = .org
            } content: {
                if let org {
                    TKDot(color: org.color)
                    Text(org.name).lineLimit(1)
                } else {
                    Text("Organization")
                }
                TKChevron()
            }
        case .task, .session:
            TKChipButton(style: .empty, leadingInset: 10) {
                picker = .project
            } content: {
                if project.isEmpty {
                    Text("Project")
                } else {
                    TKDot(color: projectColor)
                    Text(project).lineLimit(1)
                }
                TKChevron()
            }
        }
    }

    // MARK: Fields

    private var titleField: some View {
        TextField(titlePlaceholder, text: $title, axis: .vertical)
            .font(.system(size: 22, weight: .semibold))
            .foregroundStyle(TK.text)
            .lineLimit(1...3)
            .submitLabel(.next)
    }

    private var descriptionField: some View {
        TextField(kind == .ticket ? "Describe the issue…" : "Add a description…", text: $details, axis: .vertical)
            .font(.system(size: 15))
            .foregroundStyle(TK.textBody)
            .lineLimit(2...8)
    }

    private var chips: some View {
        ChipFlow(spacing: 8) {
            switch kind {
            case .ticket:
                categoryChip
                priorityChip(ticketPriority, picker: .priority)
                assigneeChip
            case .task:
                typeChip
                statusChip
                priorityChip(taskPriority, picker: .priority)
                assigneeChip
                dueChip
                estimateChip
            case .session:
                EmptyView()
            }
        }
    }

    private var typeChip: some View {
        TKChipButton {
            picker = .type
        } content: {
            TypeBadge(type: type, showLabel: false, size: 20)
            Text(type.label)
        }
    }

    private var statusChip: some View {
        TKChipButton {
            picker = .status
        } content: {
            StatusDot(status: status, size: 16)
            Text(status.label)
        }
    }

    private func priorityChip(_ priority: TaskPriority, picker target: Picker) -> some View {
        TKChipButton(style: priority == .none ? .empty : .filled) {
            picker = target
        } content: {
            if priority == .none {
                Text("Priority")
            } else {
                PriorityBars(priority: priority)
                Text(priority.label)
            }
        }
    }

    private var categoryChip: some View {
        TKChipButton {
            picker = .category
        } content: {
            TKDot(color: category.color)
            Text(category.label)
        }
    }

    private var assigneeChip: some View {
        let users = assignees.sorted { $0.name < $1.name }
        return TKChipButton(style: users.isEmpty ? .empty : .filled, leadingInset: users.isEmpty ? 12 : 7) {
            picker = .assignees
        } content: {
            if users.isEmpty {
                Image(systemName: "person").font(.system(size: 12, weight: .medium))
                Text("Assignee")
            } else {
                AvatarStack(users: users, size: 26)
                Text(users.count == 1 ? users[0].name : "\(users.count) assignees")
                    .lineLimit(1)
            }
        }
    }

    private var dueChip: some View {
        TKChipButton(style: due == nil ? .empty : .filled) {
            picker = .due
        } content: {
            Image(systemName: "calendar").font(.system(size: 12, weight: .medium))
            if let due {
                Text(due.formatted(.dateTime.day().month(.abbreviated)))
            } else {
                Text("Due date")
            }
        }
    }

    private var estimateChip: some View {
        TKChipButton(style: estimate == nil ? .empty : .filled) {
            picker = .estimate
        } content: {
            if let estimate {
                Text("Est").foregroundStyle(TK.text2)
                Text(estimate.minutesFormatted).font(.tkMono(13, weight: .medium))
            } else {
                Image(systemName: "clock").font(.system(size: 12, weight: .medium))
                Text("Estimate")
            }
        }
    }

    // MARK: Session

    private var sessionBlock: some View {
        VStack(alignment: .leading, spacing: 14) {
            let running = model?.session.isRunning ?? false
            Text(running
                 ? "A session is already running — finish or discard it from the bar below before starting another."
                 : "The timer runs in the bar below while you work. Notes you add become comments, and finishing turns the session into a task\(project.isEmpty ? "" : " in \(project)")."
            )
            .font(.system(size: 14))
            .foregroundStyle(TK.text2)
            .fixedSize(horizontal: false, vertical: true)
            TKAccentButton(title: "Start session", icon: "play.fill", enabled: canCreate, action: startSession)
        }
        .padding(.top, 6)
    }

    // MARK: Footer

    private var footerBar: some View {
        HStack(spacing: 10) {
            TKSecondaryButton(title: "Cancel") { dismiss() }
            Spacer()
            TKAccentButton(title: kind == .ticket ? "Create ticket" : "Create task", enabled: canCreate, action: create)
        }
        .padding(.horizontal, TK.gutter)
        .padding(.top, 12)
        .padding(.bottom, 12)
        .overlay(alignment: .top) { TKHairline(color: TK.hairlineStrong) }
        .background(TK.bgRaised)
    }

    // MARK: Pickers

    @ViewBuilder
    private func pickerSheet(_ which: Picker) -> some View {
        switch which {
        case .kind:
            TKPickerSheet(
                title: "Create",
                options: CreateKind.allCases.map { option in
                    TKPickerOption(option, label: label(for: option)) {
                        TKPickerIcon.symbol(symbol(for: option))
                    }
                },
                selected: kind
            ) { picked in
                withAnimation(.snappy(duration: 0.2)) { kind = picked }
            }
        case .project:
            ProjectPickerScreen(choices: projectChoices, recents: recentProjectNames, selection: $project)
        case .org:
            TKPickerSheet(
                title: "Organization",
                options: orgOptions.map { option in
                    TKPickerOption(option, label: option.name) { TKPickerIcon.dot(option.color) }
                },
                selected: org,
                searchable: orgOptions.count > 6,
                searchPlaceholder: "Search organizations…"
            ) { org = $0 }
        case .type:
            TKPickerSheet(
                title: "Type",
                options: TaskType.allCases.map { option in
                    TKPickerOption(option, label: option.label) { TypeBadge(type: option, showLabel: false, size: 22) }
                },
                selected: type
            ) { type = $0 }
        case .status:
            TKPickerSheet(
                title: "Status",
                options: TaskStatus.allCases.map { option in
                    TKPickerOption(option, label: option.label) { StatusDot(status: option, size: 18) }
                },
                selected: status
            ) { status = $0 }
        case .priority:
            let cases = kind == .ticket ? TaskPriority.ticketCases : TaskPriority.allCases
            TKPickerSheet(
                title: "Priority",
                options: cases.map { option in
                    TKPickerOption(option, label: option.label) {
                        PriorityBars(priority: option).frame(width: 26)
                    }
                },
                selected: kind == .ticket ? ticketPriority : taskPriority
            ) { picked in
                if kind == .ticket { ticketPriority = picked } else { taskPriority = picked }
            }
        case .category:
            TKPickerSheet(
                title: "Category",
                options: TicketCategory.allCases.map { option in
                    TKPickerOption(option, label: option.label) { TKPickerIcon.dot(option.color) }
                },
                selected: category
            ) { category = $0 }
        case .assignees:
            TKMultiPickerSheet(
                title: "Assignees",
                options: userOptions.map { user in
                    TKPickerOption(user, label: user.name) { TKPickerIcon.avatar(user) }
                },
                selected: assignees,
                searchable: userOptions.count > 8,
                searchPlaceholder: "Search people…",
                onToggle: { user in
                    if assignees.contains(user) { assignees.remove(user) } else { assignees.insert(user) }
                },
                onClear: { assignees = [] }
            )
        case .due:
            TKDatePickerSheet(title: "Due date", selected: due) { due = $0 }
        case .estimate:
            TKPickerSheet(
                title: "Estimate",
                options: EstimateOptions.all.map { option in
                    TKPickerOption(option.minutes ?? -1, label: option.label)
                },
                selected: estimate ?? -1
            ) { estimate = $0 < 0 ? nil : $0 }
        }
    }

    private func label(for kind: CreateKind) -> String {
        switch kind {
        case .ticket: "Ticket"
        case .task: "Task"
        case .session: "Work session"
        }
    }

    private func symbol(for kind: CreateKind) -> String {
        switch kind {
        case .ticket: "ticket"
        case .task: "checkmark.square"
        case .session: "play.circle"
        }
    }

    // MARK: Seeding

    private func seed() {
        guard !seeded else { return }
        seeded = true
        kind = initialKind
        if let initialTitle { title = initialTitle }
        if let initialPriority {
            taskPriority = initialPriority
            ticketPriority = initialPriority
        }
        // Scope: the page "+" was tapped on, else the first favorite, the
        // most recently used project, or the first option.
        if project.isEmpty {
            project = initialProject
                ?? model?.favoriteProjects.first?.name
                ?? recentProjectNames.first
                ?? projectOptions.first
                ?? ""
        }
        if org == nil {
            org = initialOrgKey.flatMap { key in orgOptions.first { $0.key == key } }
                ?? orgOptions.first
        }
        // Web parity: the creator is the default assignee (the server
        // falls back to them anyway — preselect so the UI matches).
        if assignees.isEmpty, let me = model?.currentUser {
            let match = userOptions.first { $0.serverId == me.serverId } ?? me
            assignees = [match]
        }
    }

    // MARK: Actions

    private func create() {
        guard canCreate else { return }
        switch kind {
        case .task:
            onCreateTask?(makeTask(), staging.files)
        case .ticket:
            guard let ticket = makeTicket() else { return }
            onCreateTicket?(ticket, staging.files)
        case .session:
            return
        }
        dismiss()
    }

    private func startSession() {
        guard let model, !project.isEmpty else { return }
        model.startSession(for: projectRef)
        model.session.title = trimmedTitle
        dismiss()
        model.toast("Session started")
    }

    private func makeTask() -> TaskItem {
        let nextNumber = tasks
            .compactMap { Int($0.id.split(separator: "-").last ?? "") }
            .max()
            .map { $0 + 1 } ?? 1
        return TaskItem(
            id: "TRK-\(nextNumber)",
            title: trimmedTitle,
            status: status,
            priority: taskPriority,
            type: type,
            project: project,
            details: details.trimmingCharacters(in: .whitespacesAndNewlines),
            due: due,
            plannedFor: initialPlannedFor,
            estimate: estimate,
            assignees: assignees.sorted { $0.name < $1.name }
        )
    }

    private func makeTicket() -> TicketItem? {
        guard let org else { return nil }
        // Next number within the org's display-id namespace.
        let nextNumber = tickets
            .filter { $0.org == org }
            .compactMap { Int($0.id.split(separator: "-").last ?? "") }
            .max()
            .map { $0 + 1 } ?? 1
        let me = model?.me ?? TaskItem.sampleUsers[0]
        let text = details.trimmingCharacters(in: .whitespacesAndNewlines)
        return TicketItem(
            id: "\(org.key)-\(nextNumber)",
            subject: trimmedTitle,
            status: .open,
            priority: ticketPriority,
            category: category,
            channel: .webForm,
            org: org,
            assignees: Array(assignees),
            messages: text.isEmpty ? [] : [TicketMessage(user: me, date: .now, text: text)],
            createdAt: .now
        )
    }
}

#Preview("Ticket") {
    let model = AppModel()
    model.createKind = .ticket
    return Color.clear.sheet(isPresented: .constant(true)) {
        CreateSheet(model: model)
    }
    .preferredColorScheme(.dark)
}

#Preview("Task") {
    let model = AppModel()
    model.createKind = .task
    return Color.clear.sheet(isPresented: .constant(true)) {
        CreateSheet(model: model)
    }
    .preferredColorScheme(.dark)
}

#Preview("Session") {
    let model = AppModel()
    model.createKind = .session
    return Color.clear.sheet(isPresented: .constant(true)) {
        CreateSheet(model: model)
    }
    .preferredColorScheme(.dark)
}
