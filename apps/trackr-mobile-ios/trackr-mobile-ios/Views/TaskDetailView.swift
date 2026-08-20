//
//  TaskDetailView.swift
//  trackr-mobile-ios
//
//  Mobile version of the web task Inspector. The tab bar is hidden here;
//  a bottom toolbar takes its place (attach / tag / log time capsule +
//  standalone chat button).
//
//  Design phase: edits (checklist, tags, time logs) mutate a local copy
//  only — persistence comes with the API.
//

import SwiftUI

struct TaskDetailView: View {
    @State var task: TaskItem
    /// nil in previews; the real app passes it so edits persist + push.
    var model: AppModel? = nil

    @State private var baseline: TaskItem?
    @State private var showingComments = false
    @State private var showingTimeLog = false
    @State private var showingAddTag = false
    @State private var showingAttachments = false
    @State private var newChecklistItem = ""

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 22) {
                header
                properties
                section("Description") { descriptionCard }
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text(
                            (task.checklistTotal > 0
                                ? "Checklist \(task.checklistDone)/\(task.checklistTotal)"
                                : "Checklist"
                            ).uppercased()
                        )
                        .font(.system(size: 11, weight: .semibold))
                        .tracking(0.6)
                        .foregroundStyle(.secondary)
                        Spacer()
                        if task.checklistTotal > 0 {
                            ProgressView(
                                value: Double(task.checklistDone),
                                total: Double(task.checklistTotal)
                            )
                            .frame(width: 90)
                        }
                    }
                    .padding(.horizontal, 4)
                    checklistCard
                }
                if !task.tags.isEmpty {
                    section("Tags") { tagsRow }
                }
                section("Attachments") { attachmentsCard }
                if !task.timeLogs.isEmpty {
                    section("Activity") { activityCard }
                }
            }
            .padding(.horizontal, 16)
            .padding(.bottom, 24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Color(.systemGroupedBackground))
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
        .onDisappear { persist() }
        .navigationTitle(task.id)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            // Attach / tag / time share one capsule, chat stands alone —
            // the tab bar keeps the bottom everywhere.
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    showingAttachments = true
                } label: {
                    Image(systemName: "paperclip")
                }
                Button {
                    showingAddTag = true
                } label: {
                    Image(systemName: "tag")
                }
                Button {
                    showingTimeLog = true
                } label: {
                    Image(systemName: "clock")
                }
            }
            ToolbarSpacer(.fixed, placement: .topBarTrailing)
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showingComments = true
                } label: {
                    Image(systemName: "bubble.left")
                }
            }
        }
        .navigationDestination(isPresented: $showingComments) {
            TaskCommentsView(task: $task, model: model)
        }
        .sheet(isPresented: $showingTimeLog) {
            TimeLogSheet(task: task, me: model?.me ?? TaskItem.sampleUsers[0]) { log in
                task.timeLogs.append(log)
                if let uuid = task.uuid {
                    model?.sync?.logTime(
                        taskUUID: uuid, minutes: log.minutes, date: log.date, note: log.note
                    )
                }
            }
        }
        .sheet(isPresented: $showingAddTag) {
            AddTagSheet(existingTags: task.tags) { tag in
                task.tags.append(tag)
            }
        }
        .sheet(isPresented: $showingAttachments) {
            AttachmentsSheet()
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

    // MARK: - Sections

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(task.project)
                .font(.system(size: 13))
                .foregroundStyle(.secondary)
            TextField("Task title", text: $task.title, axis: .vertical)
                .font(.system(size: 22, weight: .semibold))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Menu {
                        Picker("Type", selection: $task.type) {
                            ForEach(TaskType.allCases) { type in
                                Text("\(Image(systemName: type.systemImage))  \(type.label)")
                                    .tag(type)
                            }
                        }
                    } label: {
                        chip(task.type.color) {
                            Image(systemName: task.type.systemImage)
                                .font(.system(size: 12, weight: .semibold))
                            Text(task.type.label)
                        }
                    }
                    .id(task.type)
                    Menu {
                        Picker("Status", selection: $task.status) {
                            ForEach(TaskStatus.allCases) { Text($0.label).tag($0) }
                        }
                    } label: {
                        chip(task.status.color) {
                            StatusDot(status: task.status, size: 12)
                            Text(task.status.label)
                        }
                    }
                    .id(task.status)
                    Menu {
                        Picker("Priority", selection: $task.priority) {
                            ForEach(TaskPriority.allCases) { Text($0.label).tag($0) }
                        }
                    } label: {
                        chip(task.priority.color) {
                            PriorityBars(priority: task.priority)
                            Text(task.priority.label)
                        }
                    }
                    .id(task.priority)
                }
            }
        }
        .padding(.top, 8)
    }

    private var properties: some View {
        VStack(spacing: 0) {
            propertyRow("Assignees") {
                Menu {
                    ForEach(model?.assignableUsers ?? TaskItem.sampleUsers, id: \.self) { user in
                        Toggle(user.name, isOn: Binding(
                            get: { task.assignees.contains(user) },
                            set: { isOn in
                                if isOn {
                                    task.assignees.append(user)
                                } else {
                                    task.assignees.removeAll { $0 == user }
                                }
                            }
                        ))
                    }
                } label: {
                    if task.assignees.isEmpty {
                        Text("Unassigned")
                            .foregroundStyle(Color(.tertiaryLabel))
                    } else {
                        HStack(spacing: 6) {
                            AvatarStack(users: task.assignees, size: 20)
                            Text(task.assignees.count == 1
                                 ? task.assignees[0].name
                                 : "\(task.assignees.count) assignees")
                                .foregroundStyle(Color.primary)
                        }
                    }
                }
                .id(task.assignees)
            }
            divider
            propertyRow("Due") {
                dateValue($task.due, countdown: task.dueCountdown)
            }
            divider
            propertyRow("Planned") {
                dateValue($task.plannedFor)
            }
            divider
            propertyRow("Estimate") {
                Menu {
                    Picker("Estimate", selection: $task.estimate) {
                        ForEach(EstimateOptions.all, id: \.minutes) { option in
                            Text(option.label).tag(option.minutes)
                        }
                    }
                } label: {
                    Text(task.estimate.map(\.minutesFormatted) ?? "Add estimate")
                        .monospaced()
                        .foregroundStyle(
                            task.estimate == nil ? Color(.tertiaryLabel) : Color.primary
                        )
                }
                .id(task.estimate)
            }
            divider
            propertyRow("Logged") {
                Text(task.loggedMinutes > 0 ? task.loggedMinutes.minutesFormatted : "—")
                    .monospaced()
                    .foregroundStyle(task.loggedMinutes > 0 ? .primary : .tertiary)
            }
        }
        .cardStyle(padded: false)
    }

    private var descriptionCard: some View {
        TextField("Add description…", text: $task.details, axis: .vertical)
            .font(.system(size: 15))
            .lineSpacing(3)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardStyle()
    }

    private var checklistCard: some View {
        VStack(spacing: 0) {
            if task.checklistTotal > 0 {
                // Embedded non-scrolling List purely for the native swipe
                // actions — invisible inside the card.
                List {
                    ForEach($task.checklist) { $item in
                        Button {
                            item.done.toggle()
                        } label: {
                            HStack(spacing: 10) {
                                Image(systemName: item.done ? "checkmark.square.fill" : "square")
                                    .foregroundStyle(
                                        item.done ? Color.accentColor : Color(.tertiaryLabel)
                                    )
                                Text(item.text)
                                    .font(.system(size: 15))
                                    .strikethrough(item.done)
                                    .foregroundStyle(
                                        item.done ? Color(.tertiaryLabel) : Color.primary
                                    )
                                Spacer()
                            }
                            .contentShape(.rect)
                        }
                        .buttonStyle(.plain)
                        .listRowBackground(Color(.secondarySystemGroupedBackground))
                        .listRowInsets(EdgeInsets(top: 0, leading: 14, bottom: 0, trailing: 14))
                        .swipeActions(edge: .leading, allowsFullSwipe: true) {
                            Button {
                                item.done.toggle()
                            } label: {
                                Label(
                                    item.done ? "Uncheck" : "Done",
                                    systemImage: item.done ? "arrow.uturn.backward" : "checkmark"
                                )
                            }
                            .tint(item.done ? .gray : Color(hex: 0x7FC8A9))
                        }
                    }
                    .onDelete { offsets in
                        task.checklist.remove(atOffsets: offsets)
                    }
                }
                .listStyle(.plain)
                .scrollContentBackground(.hidden)
                .scrollDisabled(true)
                .environment(\.defaultMinListRowHeight, 42)
                .frame(height: CGFloat(task.checklist.count) * 42)
            }
            HStack(spacing: 10) {
                Image(systemName: "plus")
                    .foregroundStyle(.tertiary)
                TextField("Add an item…", text: $newChecklistItem)
                    .font(.system(size: 15))
                    .onSubmit {
                        let text = newChecklistItem.trimmingCharacters(in: .whitespaces)
                        guard !text.isEmpty else { return }
                        task.checklist.append(ChecklistItem(text: text))
                        newChecklistItem = ""
                    }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
        }
        .cardStyle(padded: false)
    }

    private var tagsRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(task.tags, id: \.self) { TagChip(tag: $0) }
            }
        }
    }

    private var attachmentsCard: some View {
        Text("No files attached.")
            .font(.system(size: 14))
            .foregroundStyle(.secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
            .cardStyle()
    }

    private var activityCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            ForEach(task.timeLogs.sorted { $0.date > $1.date }) { log in
                HStack(alignment: .top, spacing: 10) {
                    AvatarView(user: log.user, size: 24)
                    VStack(alignment: .leading, spacing: 2) {
                        HStack(spacing: 5) {
                            Text(log.user.name)
                                .font(.system(size: 14, weight: .medium))
                            Text("logged \(log.minutes.minutesFormatted)")
                                .font(.system(size: 14))
                                .foregroundStyle(.secondary)
                            Spacer()
                            Text(log.date.formatted(.dateTime.day().month(.abbreviated)))
                                .font(.system(size: 12, design: .monospaced))
                                .foregroundStyle(.tertiary)
                        }
                        if let note = log.note {
                            Text(note)
                                .font(.system(size: 14))
                                .italic()
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle()
    }

    // MARK: - Helpers

    private func logActivity(_ text: String, icon: String) {
        task.activity.append(
            ActivityEvent(user: model?.me ?? TaskItem.sampleUsers[0], date: .now,
                          text: text, icon: icon)
        )
    }

    /// Write the edit back into the shared model and push it to the server.
    /// Compared against the last pushed state so no-op closes don't PATCH.
    private func persist() {
        guard task != baseline else { return }
        baseline = task
        guard let model else { return }
        if let index = model.tasks.firstIndex(where: { $0.id == task.id }) {
            model.tasks[index] = task
        }
        model.sync?.pushTask(task)
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

    /// Editable date value: custom compact text with an invisible native
    /// DatePicker overlaid, so tapping opens the system calendar popover.
    @ViewBuilder
    private func dateValue(
        _ date: Binding<Date?>,
        countdown: (label: String, tone: DueTone)? = nil
    ) -> some View {
        if let value = date.wrappedValue {
            HStack(spacing: 8) {
                if let countdown {
                    Text(countdown.label)
                        .fontWeight(.medium)
                        .foregroundStyle(countdown.tone.color ?? .secondary)
                }
                Text(value.formatted(.dateTime.day().month(.abbreviated).year()))
                    .monospaced()
                    .overlay {
                        DatePicker(
                            "Date",
                            selection: Binding(
                                get: { date.wrappedValue ?? .now },
                                set: { date.wrappedValue = $0 }
                            ),
                            displayedComponents: .date
                        )
                        .labelsHidden()
                        .colorMultiply(.clear)
                    }
                Button {
                    date.wrappedValue = nil
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .foregroundStyle(Color(.tertiaryLabel))
                }
                .buttonStyle(.plain)
            }
        } else {
            Button("Add date") { date.wrappedValue = .now }
                .foregroundStyle(Color(.tertiaryLabel))
                .monospaced()
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

    /// Tinted capsule chip in the TypeBadge recipe: colored content on a
    /// slightly lighter background of the same color, with a colored border.
    private func chip(_ color: Color, @ViewBuilder content: () -> some View) -> some View {
        HStack(spacing: 6, content: content)
            .font(.system(size: 13, weight: .medium))
            .foregroundStyle(color)
            .padding(.horizontal, 10)
            .frame(height: 28)
            .background(color.opacity(0.10), in: .capsule)
            .overlay(Capsule().strokeBorder(color.opacity(0.30), lineWidth: 1))
    }

    private var divider: some View {
        Divider().padding(.leading, 14)
    }
}

/// Shared elevated-card look, same recipe as TaskCard.
extension View {
    func cardStyle(padded: Bool = true) -> some View {
        self
            .padding(padded ? 14 : 0)
            .background(Color(.secondarySystemGroupedBackground), in: .rect(cornerRadius: 16))
            // Clip content (e.g. embedded List row backgrounds) to the
            // card's rounded shape.
            .clipShape(.rect(cornerRadius: 16))
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .strokeBorder(Color(.separator).opacity(0.4), lineWidth: 0.5)
            )
    }
}

#Preview {
    NavigationStack {
        TaskDetailView(task: TaskItem.samples[0])
    }
}
